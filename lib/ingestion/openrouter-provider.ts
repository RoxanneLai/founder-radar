import "server-only";
import { z } from "zod";
import { extractionSchema } from "./contracts.ts";
import type {
  DiscoveryProvider,
  Extraction,
  Research,
  SearchOptions,
  SourceIdentity,
} from "./contracts.ts";
import { ALLOWED_DOMAINS } from "./sources.ts";
import { IngestionError } from "./errors.ts";
import {
  EXTRACTION_INSTRUCTIONS,
  RESEARCH_INSTRUCTIONS,
  extractionInput,
  researchInput,
} from "./prompts.ts";
import {
  parseRouterResponse,
  providerHttpError,
  readResponseJson,
  routerMetadata,
} from "./openrouter-response.ts";
import type { RouterResponse } from "./openrouter-response.ts";

export const API_LIMITS = {
  calls: 2,
  searchToolCalls: 3,
  searchResultsPerCall: 5,
  totalSearchResults: 15,
  searchResultCharacters: 2000,
  researchOutputTokens: 6000,
  extractionOutputTokens: 12000,
  requestTimeoutMs: 120000,
  reportCharacters: 40000,
  responseBytes: 1048576,
} as const;

/** Fixed HTTPS endpoint; no custom URLs, retries, redirects, or model fallback. */
export function createOpenRouterProvider(
  apiKey: string,
  model: string,
): DiscoveryProvider {
  return new OpenRouterSearchProvider(apiKey, model);
}

export class OpenRouterSearchProvider implements DiscoveryProvider {
  private calls = 0;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, model: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetcher = fetcher;
  }

  private async request(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<RouterResponse> {
    if (signal.aborted) throw new IngestionError("run_cancelled");
    if (this.calls >= API_LIMITS.calls)
      throw new IngestionError("api_call_limit");
    this.calls += 1;
    const boundedSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(API_LIMITS.requestTimeoutMs),
    ]);
    try {
      const response = await this.fetcher(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.apiKey,
            "Content-Type": "application/json",
          },
          redirect: "error",
          signal: boundedSignal,
          body: JSON.stringify({
            model: this.model,
            stream: false,
            provider: { require_parameters: true, allow_fallbacks: false },
            ...body,
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw providerHttpError(response.status);
      }
      const value = await readResponseJson(response, API_LIMITS.responseBytes);
      if (signal.aborted) throw new IngestionError("run_cancelled");
      if (boundedSignal.aborted)
        throw new IngestionError("provider_request_timeout");
      return parseRouterResponse(value);
    } catch (error) {
      if (signal.aborted) throw new IngestionError("run_cancelled");
      if (boundedSignal.aborted)
        throw new IngestionError("provider_request_timeout");
      if (error instanceof IngestionError) throw error;
      throw new IngestionError("provider_request_failed");
    }
  }

  async research(
    options: SearchOptions,
    signal: AbortSignal,
  ): Promise<Research> {
    const response = await this.request(
      {
        messages: [
          { role: "system", content: RESEARCH_INSTRUCTIONS },
          { role: "user", content: researchInput(options) },
        ],
        tools: [
          {
            type: "openrouter:web_search",
            parameters: {
              engine: "exa",
              mode: "auto",
              max_uses: API_LIMITS.searchToolCalls,
              max_results: API_LIMITS.searchResultsPerCall,
              max_total_results: API_LIMITS.totalSearchResults,
              max_characters: API_LIMITS.searchResultCharacters,
              allowed_domains: ALLOWED_DOMAINS,
            },
          },
        ],
        tool_choice: "required",
        max_tool_calls: API_LIMITS.searchToolCalls,
        max_tokens: API_LIMITS.researchOutputTokens,
      },
      signal,
    );
    const searches = response.usage?.server_tool_use?.web_search_requests;
    if (!searches) throw new IngestionError("search_not_performed");
    if (searches > API_LIMITS.searchToolCalls)
      throw new IngestionError("search_tool_limit_exceeded");
    const message = response.choices[0].message;
    const report = message.content;
    if (!report?.trim() || report.length > API_LIMITS.reportCharacters)
      throw new IngestionError("invalid_research_report");
    const urls = new Set<string>();
    for (const annotation of message.annotations ?? []) {
      if (annotation.type === "url_citation" && annotation.url_citation)
        urls.add(annotation.url_citation.url);
    }
    return {
      report,
      urls: [...urls],
      metadata: routerMetadata(response, this.model),
    };
  }

  async extract(
    research: Research,
    sources: SourceIdentity[],
    signal: AbortSignal,
  ): Promise<Extraction> {
    const response = await this.request(
      {
        messages: [
          { role: "system", content: EXTRACTION_INSTRUCTIONS },
          { role: "user", content: extractionInput(research, sources) },
        ],
        tools: [],
        tool_choice: "none",
        max_tokens: API_LIMITS.extractionOutputTokens,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "event_candidates",
            strict: true,
            schema: z.toJSONSchema(extractionSchema),
          },
        },
      },
      signal,
    );
    if (response.usage?.server_tool_use?.web_search_requests)
      throw new IngestionError("unexpected_extraction_search");
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.choices[0].message.content ?? "");
    } catch {
      throw new IngestionError("invalid_extraction_json");
    }
    // Preserve per-candidate validation so one malformed sibling cannot erase good evidence.
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("candidates" in parsed) ||
      !Array.isArray(parsed.candidates) ||
      parsed.candidates.length > sources.length
    )
      throw new IngestionError("invalid_extraction_shape");
    return {
      candidates: parsed.candidates,
      metadata: routerMetadata(response, this.model),
    };
  }
}
