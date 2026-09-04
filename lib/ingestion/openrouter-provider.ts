import "server-only";
import { z } from "zod";
import { candidateSchema } from "./contracts.ts";
import type {
  DiscoveryProvider,
  Extraction,
  ProviderDiagnostic,
  Research,
  SearchOptions,
  SourceIdentity,
} from "./contracts.ts";
import { ALLOWED_DOMAINS, sourceIdentity } from "./sources.ts";
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
import { routerDiagnostic } from "./openrouter-diagnostics.ts";

export const API_LIMITS = {
  calls: 2,
  searchToolCalls: 3,
  fetchToolCalls: 10,
  fetchContentTokens: 6000,
  searchResultsPerCall: 5,
  totalSearchResults: 15,
  searchResultCharacters: 2000,
  researchOutputTokens: 6000,
  extractionOutputTokens: 12000,
  requestTimeoutMs: 120000,
  reportCharacters: 40000,
  responseBytes: 1048576,
} as const;

/** Intersect trusted annotations with canonical listing URLs actually named in the report. */
function reportedSourceUrls(response: RouterResponse): string[] {
  const message = response.choices[0].message;
  const annotated = new Set(
    (message.annotations ?? [])
      .filter(
        (annotation) =>
          annotation.type === "url_citation" && annotation.url_citation,
      )
      .map(
        (annotation) =>
          sourceIdentity(annotation.url_citation!.url)?.source_url,
      )
      .filter((url): url is string => Boolean(url)),
  );
  const collect = (text: string): string[] => {
    const urls: string[] = [];
    for (const match of text.matchAll(/https:\/\/[^\s)\]}>'"]+/g)) {
      const url = sourceIdentity(
        match[0].replace(/[.,;:!?]+$/, ""),
      )?.source_url;
      if (url && annotated.has(url) && !urls.includes(url)) urls.push(url);
    }
    return urls;
  };
  const sections = (message.content ?? "")
    .split(/^###\s+\d+[.)]\s+/gm)
    .slice(1);
  if (sections.length) {
    const primary = sections.flatMap((section) => collect(section).slice(0, 1));
    if (primary.length) return [...new Set(primary)];
  }
  const selected = new Set<string>();
  for (const url of collect(message.content ?? "")) selected.add(url);
  return [...selected];
}

function coversEverySource(
  candidates: unknown[],
  sources: SourceIdentity[],
): boolean {
  if (candidates.length !== sources.length) return false;
  const expected = new Set(sources.map((source) => source.source_url));
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidateSchema.safeParse(candidate).success) return false;
    const url =
      candidate &&
      typeof candidate === "object" &&
      "source_url" in candidate &&
      typeof candidate.source_url === "string"
        ? sourceIdentity(candidate.source_url)?.source_url
        : null;
    if (!url || !expected.has(url) || seen.has(url)) return false;
    seen.add(url);
  }
  return seen.size === expected.size;
}

function extractionCandidates(
  value: unknown,
  diagnostic: ProviderDiagnostic,
  allowEncoded = true,
): unknown[] | null {
  if (allowEncoded) diagnostic.extraction_shape = "invalid";
  if (typeof value === "string" && allowEncoded) {
    try {
      const nested = extractionCandidates(JSON.parse(value), diagnostic, false);
      if (nested) diagnostic.extraction_shape = "encoded_candidate_envelope";
      return nested;
    } catch {
      return null;
    }
  }
  let candidates: unknown[] | null = null;
  if (Array.isArray(value)) {
    diagnostic.extraction_shape = "candidate_array";
    candidates = value;
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (
      keys.length === 1 &&
      keys[0] === "candidates" &&
      "candidates" in value &&
      Array.isArray(value.candidates)
    ) {
      diagnostic.extraction_shape = "candidates_object";
      candidates = value.candidates;
    } else if (
      keys.length === 1 &&
      keys[0] === "event_candidates" &&
      "event_candidates" in value &&
      Array.isArray(value.event_candidates)
    ) {
      diagnostic.extraction_shape = "schema_named_object";
      candidates = value.event_candidates;
    }
  }
  if (candidates && candidates.length <= 100)
    diagnostic.extraction_candidate_count = candidates.length;
  return candidates;
}

/** Fixed HTTPS endpoint; no custom URLs, retries, redirects, or model fallback. */
export function createOpenRouterProvider(
  apiKey: string,
  model: string,
): DiscoveryProvider {
  return new OpenRouterSearchProvider(apiKey, model);
}

export class OpenRouterSearchProvider implements DiscoveryProvider {
  private calls = 0;
  private readonly diagnostics: ProviderDiagnostic[] = [];
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, model: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetcher = fetcher;
  }

  /** Return copies so local progress hooks cannot mutate the recorded diagnostics. */
  getDiagnostics(): ProviderDiagnostic[] {
    return structuredClone(this.diagnostics);
  }

  private async request(
    phase: ProviderDiagnostic["phase"],
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<RouterResponse> {
    if (signal.aborted) throw new IngestionError("run_cancelled");
    if (this.calls >= API_LIMITS.calls)
      throw new IngestionError("api_call_limit");
    this.calls += 1;
    const diagnostic = routerDiagnostic(null, phase, this.model, this.apiKey);
    this.diagnostics.push(diagnostic);
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
      diagnostic.http_status = response.status;
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw providerHttpError(response.status);
      }
      const value = await readResponseJson(response, API_LIMITS.responseBytes);
      Object.assign(
        diagnostic,
        routerDiagnostic(
          value,
          phase,
          this.model,
          this.apiKey,
          response.status,
        ),
      );
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

  private verifyResearchSearch(response: RouterResponse): ProviderDiagnostic {
    const diagnostic = this.diagnostics.at(-1)!;
    const searches = response.usage?.server_tool_use?.web_search_requests;
    if (searches != null) {
      if (searches === 0) throw new IngestionError("search_not_performed");
      if (searches > API_LIMITS.searchToolCalls)
        throw new IngestionError("search_tool_limit_exceeded");
      diagnostic.search_verification = "usage_counter";
      return diagnostic;
    }
    const citations = (response.choices[0].message.annotations ?? []).filter(
      (annotation) =>
        annotation.type === "url_citation" && annotation.url_citation,
    );
    if (citations.length === 0)
      throw new IngestionError("search_usage_missing");
    if (citations.length > API_LIMITS.totalSearchResults)
      throw new IngestionError("search_result_limit_exceeded");
    if (
      !citations.some((citation) => sourceIdentity(citation.url_citation!.url))
    )
      throw new IngestionError("invalid_search_citation");
    diagnostic.search_verification = "bounded_citations";
    return diagnostic;
  }

  private verifyExtractionFetch(
    response: RouterResponse,
    expected: number,
    completeSourceCoverage: boolean,
  ): ProviderDiagnostic {
    const diagnostic = this.diagnostics.at(-1)!;
    const searches = response.usage?.server_tool_use?.web_search_requests;
    if (searches != null && searches !== 0)
      throw new IngestionError("unexpected_extraction_search");
    const fetches = response.usage?.server_tool_use?.web_fetch_requests;
    if (fetches == null) {
      if (!completeSourceCoverage)
        throw new IngestionError("source_fetch_usage_missing");
      diagnostic.fetch_verification = "required_tool_and_source_coverage";
      return diagnostic;
    }
    if (fetches < expected) throw new IngestionError("source_fetch_incomplete");
    if (fetches > expected || fetches > API_LIMITS.fetchToolCalls)
      throw new IngestionError("source_fetch_limit_exceeded");
    diagnostic.fetch_verification = "usage_counter";
    return diagnostic;
  }

  async research(
    options: SearchOptions,
    signal: AbortSignal,
  ): Promise<Research> {
    const response = await this.request(
      "research",
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
    const message = response.choices[0].message;
    const report = message.content;
    if (!report?.trim() || report.length > API_LIMITS.reportCharacters)
      throw new IngestionError("invalid_research_report");
    const diagnostic = this.verifyResearchSearch(response);
    const urls = reportedSourceUrls(response);
    return {
      report,
      urls,
      metadata: routerMetadata(response, this.model, diagnostic),
    };
  }

  async extract(
    research: Research,
    sources: SourceIdentity[],
    options: SearchOptions,
    signal: AbortSignal,
  ): Promise<Extraction> {
    const response = await this.request(
      "extraction",
      {
        messages: [
          { role: "system", content: EXTRACTION_INSTRUCTIONS },
          {
            role: "user",
            content: extractionInput(research, sources, options),
          },
        ],
        tools: [
          {
            type: "openrouter:web_fetch",
            parameters: {
              engine: "openrouter",
              max_uses: sources.length,
              max_content_tokens: API_LIMITS.fetchContentTokens,
              allowed_domains: ALLOWED_DOMAINS,
            },
          },
        ],
        tool_choice: "required",
        max_tool_calls: sources.length,
        max_tokens: API_LIMITS.extractionOutputTokens,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "event_candidates",
            strict: true,
            schema: z.toJSONSchema(
              z
                .object({
                  candidates: z.array(candidateSchema).length(sources.length),
                })
                .strict(),
            ),
          },
        },
      },
      signal,
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.choices[0].message.content ?? "");
    } catch {
      throw new IngestionError("invalid_extraction_json");
    }
    const responseDiagnostic = this.diagnostics.at(-1)!;
    const candidates = extractionCandidates(parsed, responseDiagnostic);
    // Preserve per-candidate validation so one malformed sibling cannot erase good evidence.
    if (!candidates || candidates.length !== sources.length)
      throw new IngestionError("invalid_extraction_shape");
    const verifiedDiagnostic = this.verifyExtractionFetch(
      response,
      sources.length,
      coversEverySource(candidates, sources),
    );
    return {
      candidates,
      metadata: routerMetadata(response, this.model, verifiedDiagnostic),
    };
  }
}
