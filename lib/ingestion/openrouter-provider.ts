import "server-only";
import { z } from "zod";
import type { Json } from "../database.types.ts";
import { candidateSchema } from "./contracts.ts";
import type {
  DiscoveryProvider,
  Extraction,
  ProviderDiagnostic,
  ReasoningEffort,
  Research,
  SearchOptions,
  SourceIdentity,
} from "./contracts.ts";
import { ALLOWED_DOMAINS, sourceIdentity } from "./sources.ts";
import { IngestionError } from "./errors.ts";
import {
  EXTRACTION_INSTRUCTIONS,
  REPAIR_INSTRUCTIONS,
  RESEARCH_INSTRUCTIONS,
  extractionInput,
  repairInput,
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
  calls: 3,
  primaryCalls: 2,
  repairCalls: 1,
  searchToolCalls: 3,
  fetchToolCalls: 10,
  fetchContentTokens: 6000,
  searchResultsPerCall: 5,
  totalSearchResults: 15,
  searchResultCharacters: 2000,
  researchOutputTokens: 6000,
  extractionOutputTokens: 12000,
  repairOutputTokens: 6000,
  repairInputCharacters: 60000,
  requestTimeoutMs: 120000,
  reportCharacters: 40000,
  responseBytes: 1048576,
} as const;

const flatText = z.string().nullable();
const flatQuote = z.string().nullable();
const flatVerificationReason = z
  .enum([
    "source_fetch_failed",
    "source_not_event_listing",
    "source_page_conflict",
    "source_page_past",
    "source_page_cancelled",
    "source_page_virtual_only",
    "source_evidence_insufficient",
    "failed_fetch",
  ])
  .nullable();
const flatCandidateSchema = z
  .object({
    source_url: z.string(),
    source_verification: z
      .object({
        status: z.enum(["verified", "rejected"]),
        reason: flatVerificationReason,
      })
      .strict(),
    title: flatText,
    title_quote: flatQuote,
    starts_at: flatText,
    starts_at_quote: flatQuote,
    ends_at: flatText,
    ends_at_quote: flatQuote,
    time_zone: flatText,
    time_zone_quote: flatQuote,
    venue_name: flatText,
    venue_name_quote: flatQuote,
    city: flatText,
    city_quote: flatQuote,
    region: flatText,
    region_quote: flatQuote,
    country_code: flatText,
    country_code_quote: flatQuote,
    event_format: flatText,
    event_format_quote: flatQuote,
    founder_investor_relevance: z.boolean().nullable(),
    founder_investor_relevance_quote: flatQuote,
    organizer: flatText,
    organizer_quote: flatQuote,
    price_amount_cents: z.number().int().min(0).max(2147483647).nullable(),
    price_amount_cents_quote: flatQuote,
    currency_code: flatText,
    currency_code_quote: flatQuote,
    registration_status: flatText,
    registration_status_quote: flatQuote,
  })
  .strict()
  .superRefine((candidate, context) => {
    const facts = [
      [candidate.title, candidate.title_quote],
      [candidate.starts_at, candidate.starts_at_quote],
      [candidate.ends_at, candidate.ends_at_quote],
      [candidate.time_zone, candidate.time_zone_quote],
      [candidate.venue_name, candidate.venue_name_quote],
      [candidate.city, candidate.city_quote],
      [candidate.region, candidate.region_quote],
      [candidate.country_code, candidate.country_code_quote],
      [candidate.event_format, candidate.event_format_quote],
      [
        candidate.founder_investor_relevance,
        candidate.founder_investor_relevance_quote,
      ],
      [candidate.organizer, candidate.organizer_quote],
      [candidate.price_amount_cents, candidate.price_amount_cents_quote],
      [candidate.currency_code, candidate.currency_code_quote],
      [candidate.registration_status, candidate.registration_status_quote],
    ];
    const rejected = candidate.source_verification.status === "rejected";
    const invalid = rejected
      ? candidate.source_verification.reason === null ||
        facts.some(([value, quote]) => value !== null || quote !== null)
      : candidate.source_verification.reason !== null;
    if (invalid)
      context.addIssue({
        code: "custom",
        message: "inconsistent flat source verification verdict",
      });
  });

const legacyNestedTextFact = z
  .object({ value: z.string().nullable(), quote: z.string().nullable() })
  .strict();
const legacyNestedPriceFact = z
  .object({
    value: z.number().int().min(0).max(2147483647).nullable(),
    quote: z.string().nullable(),
  })
  .strict();
const legacyNestedCandidateSchema = z
  .object({
    source_url: z.string(),
    source_verification: z
      .object({
        status: z.enum(["verified", "rejected"]),
        reason: flatVerificationReason,
      })
      .strict(),
    title: legacyNestedTextFact,
    starts_at: legacyNestedTextFact,
    ends_at: legacyNestedTextFact,
    time_zone: legacyNestedTextFact,
    venue: legacyNestedTextFact,
    city: legacyNestedTextFact,
    region: legacyNestedTextFact,
    country_code: legacyNestedTextFact,
    event_format: legacyNestedTextFact,
    founder_investor_relevance: legacyNestedTextFact,
    organizer: legacyNestedTextFact,
    price_amount_cents: legacyNestedPriceFact,
    currency_code: legacyNestedTextFact,
    registration_status: legacyNestedTextFact,
  })
  .strict();

function fact<T>(value: T | null, quote: string | null) {
  return { value, quote };
}

function canonicalCandidate(value: unknown): {
  value: unknown;
  format: "canonical" | "legacy_flat" | "legacy_nested" | "invalid";
} {
  if (candidateSchema.safeParse(value).success)
    return { value, format: "canonical" };
  const flat = flatCandidateSchema.safeParse(value);
  if (flat.success) return canonicalFlatCandidate(flat.data, value);
  const nested = legacyNestedCandidateSchema.safeParse(value);
  if (nested.success) return canonicalNestedCandidate(nested.data, value);
  return { value, format: "invalid" };
}

function canonicalReason(reason: z.infer<typeof flatVerificationReason>) {
  return reason === "failed_fetch" ? "source_fetch_failed" : reason;
}

function canonicalFlatCandidate(
  candidate: z.infer<typeof flatCandidateSchema>,
  original: unknown,
): {
  value: unknown;
  format: "legacy_flat" | "invalid";
} {
  const reason = canonicalReason(candidate.source_verification.reason);
  const canonical = {
    source_url: candidate.source_url,
    source_verification: {
      status: candidate.source_verification.status,
      reason,
    },
    relevant_to_founders: fact(
      candidate.founder_investor_relevance,
      candidate.founder_investor_relevance_quote,
    ),
    title: fact(candidate.title, candidate.title_quote),
    organizer_name: fact(candidate.organizer, candidate.organizer_quote),
    starts_at: fact(candidate.starts_at, candidate.starts_at_quote),
    ends_at: fact(candidate.ends_at, candidate.ends_at_quote),
    time_zone: fact(candidate.time_zone, candidate.time_zone_quote),
    venue_name: fact(candidate.venue_name, candidate.venue_name_quote),
    address_line: fact(null, null),
    city: fact(candidate.city, candidate.city_quote),
    region: fact(candidate.region, candidate.region_quote),
    country_code: fact(candidate.country_code, candidate.country_code_quote),
    event_format: fact(candidate.event_format, candidate.event_format_quote),
    price_amount_cents: fact(
      candidate.price_amount_cents,
      candidate.price_amount_cents_quote,
    ),
    currency_code: fact(candidate.currency_code, candidate.currency_code_quote),
    registration_status: fact(
      candidate.registration_status,
      candidate.registration_status_quote,
    ),
  };
  return candidateSchema.safeParse(canonical).success
    ? { value: canonical, format: "legacy_flat" }
    : { value: original, format: "invalid" };
}

function canonicalNestedCandidate(
  candidate: z.infer<typeof legacyNestedCandidateSchema>,
  original: unknown,
): {
  value: unknown;
  format: "legacy_nested" | "invalid";
} {
  const relevance = candidate.founder_investor_relevance;
  const canonical = {
    source_url: candidate.source_url,
    source_verification: {
      status: candidate.source_verification.status,
      reason: canonicalReason(candidate.source_verification.reason),
    },
    relevant_to_founders: fact(
      relevance.value === null ? null : true,
      relevance.quote,
    ),
    title: candidate.title,
    organizer_name: candidate.organizer,
    starts_at: candidate.starts_at,
    ends_at: candidate.ends_at,
    time_zone: candidate.time_zone,
    venue_name: candidate.venue,
    address_line: fact(null, null),
    city: candidate.city,
    region: candidate.region,
    country_code: candidate.country_code,
    event_format: candidate.event_format,
    price_amount_cents: candidate.price_amount_cents,
    currency_code: candidate.currency_code,
    registration_status: candidate.registration_status,
  };
  return candidateSchema.safeParse(canonical).success
    ? { value: canonical, format: "legacy_nested" }
    : { value: original, format: "invalid" };
}

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

function hasCompleteSourceCoverage(
  candidates: unknown[],
  sources: SourceIdentity[],
  diagnostic: ProviderDiagnostic,
): boolean {
  const expected = new Set(sources.map((source) => source.source_url));
  const seen = new Set<string>();
  let schemaValid = 0;
  let duplicates = 0;
  let untrusted = 0;
  for (const candidate of candidates) {
    if (candidateSchema.safeParse(candidate).success) schemaValid += 1;
    const url =
      candidate &&
      typeof candidate === "object" &&
      "source_url" in candidate &&
      typeof candidate.source_url === "string"
        ? sourceIdentity(candidate.source_url)?.source_url
        : null;
    if (!url || !expected.has(url)) {
      untrusted += 1;
      continue;
    }
    if (seen.has(url)) {
      duplicates += 1;
      continue;
    }
    seen.add(url);
  }
  diagnostic.extraction_schema_valid_count = schemaValid;
  diagnostic.extraction_source_match_count = seen.size;
  diagnostic.extraction_duplicate_source_count = duplicates;
  diagnostic.extraction_untrusted_source_count = untrusted;
  return (
    candidates.length === sources.length &&
    schemaValid === candidates.length &&
    seen.size === expected.size &&
    duplicates === 0 &&
    untrusted === 0
  );
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
  if (!candidates) return null;
  const converted = candidates.map(canonicalCandidate);
  const formats = new Set(converted.map((candidate) => candidate.format));
  diagnostic.extraction_candidate_format = formats.has("invalid")
    ? "invalid"
    : formats.size === 1
      ? (converted[0]?.format ?? "invalid")
      : "mixed";
  return converted.map((candidate) => candidate.value);
}

function candidateResponseFormat(count: number) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "event_candidates",
      strict: true,
      schema: z.toJSONSchema(
        z
          .object({ candidates: z.array(candidateSchema).length(count) })
          .strict(),
      ),
    },
  };
}

function hasRepairableSourceCoverage(
  candidates: unknown[],
  sources: SourceIdentity[],
  diagnostic: ProviderDiagnostic,
): boolean {
  return (
    candidates.length === sources.length &&
    diagnostic.extraction_candidate_count === sources.length &&
    diagnostic.extraction_source_match_count === sources.length &&
    diagnostic.extraction_duplicate_source_count === 0 &&
    diagnostic.extraction_untrusted_source_count === 0 &&
    diagnostic.extraction_schema_valid_count !== sources.length
  );
}

function scalarKey(value: string | number | boolean): string {
  return typeof value + ":" + JSON.stringify(value);
}

function collectScalars(
  value: unknown,
  result = new Set<string>(),
): Set<string> {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    result.add(scalarKey(value));
  } else if (Array.isArray(value)) {
    for (const item of value) collectScalars(item, result);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectScalars(item, result);
  }
  return result;
}

function candidateSourceUrl(value: unknown): string | null {
  return value &&
    typeof value === "object" &&
    "source_url" in value &&
    typeof value.source_url === "string"
    ? (sourceIdentity(value.source_url)?.source_url ?? null)
    : null;
}

/** A repair may rearrange existing scalar values, never introduce new facts. */
function repairPreservesCandidateScalars(
  original: unknown[],
  repaired: unknown[],
): boolean {
  const originals = new Map<string, Set<string>>();
  for (const candidate of original) {
    const url = candidateSourceUrl(candidate);
    if (!url || originals.has(url)) return false;
    originals.set(url, collectScalars(candidate));
  }
  for (const candidate of repaired) {
    const parsed = candidateSchema.safeParse(candidate);
    const url = candidateSourceUrl(candidate);
    const allowed = url ? originals.get(url) : null;
    if (!parsed.success || !allowed) return false;
    const clone = structuredClone(parsed.data) as Record<string, unknown>;
    delete clone.source_url;
    const scalars = collectScalars(clone);
    for (const scalar of scalars) {
      if (allowed.has(scalar)) continue;
      if (
        scalar === scalarKey("source_fetch_failed") &&
        allowed.has(scalarKey("failed_fetch"))
      )
        continue;
      return false;
    }
  }
  return true;
}

/** Fixed HTTPS endpoint; no custom URLs, retries, redirects, or model fallback. */
export function createOpenRouterProvider(
  apiKey: string,
  model: string,
  effort: ReasoningEffort,
  repairModel: string,
  repairEffort: ReasoningEffort,
): DiscoveryProvider {
  return new OpenRouterSearchProvider(
    apiKey,
    model,
    effort,
    fetch,
    repairModel,
    repairEffort,
  );
}

export class OpenRouterSearchProvider implements DiscoveryProvider {
  private calls = 0;
  private primaryCalls = 0;
  private repairCalls = 0;
  private readonly diagnostics: ProviderDiagnostic[] = [];
  private readonly apiKey: string;
  private readonly model: string;
  private readonly effort: ReasoningEffort;
  private readonly repairModel: string;
  private readonly repairEffort: ReasoningEffort;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    model: string,
    effort: ReasoningEffort,
    fetcher: typeof fetch = fetch,
    repairModel = "openai/gpt-5.6-luna",
    repairEffort: ReasoningEffort = "medium",
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.effort = effort;
    this.repairModel = repairModel;
    this.repairEffort = repairEffort;
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
    requestedModel = this.model,
    requestedEffort = this.effort,
  ): Promise<RouterResponse> {
    if (signal.aborted) throw new IngestionError("run_cancelled");
    const repair = phase === "repair";
    if (
      this.calls >= API_LIMITS.calls ||
      (repair
        ? this.repairCalls >= API_LIMITS.repairCalls
        : this.primaryCalls >= API_LIMITS.primaryCalls)
    )
      throw new IngestionError("api_call_limit");
    this.calls += 1;
    if (repair) this.repairCalls += 1;
    else this.primaryCalls += 1;
    const diagnostic = routerDiagnostic(
      null,
      phase,
      requestedModel,
      requestedEffort,
      this.apiKey,
    );
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
            "X-OpenRouter-Metadata": "enabled",
          },
          redirect: "error",
          signal: boundedSignal,
          body: JSON.stringify({
            model: requestedModel,
            stream: false,
            provider: { require_parameters: true, allow_fallbacks: false },
            ...body,
            reasoning: { effort: requestedEffort, exclude: true },
          }),
        },
      );
      diagnostic.http_status = response.status;
      if (!response.ok) {
        let value: unknown = null;
        try {
          value = await readResponseJson(response, API_LIMITS.responseBytes);
        } catch {
          await response.body?.cancel().catch(() => {});
        }
        Object.assign(
          diagnostic,
          routerDiagnostic(
            value,
            phase,
            requestedModel,
            requestedEffort,
            this.apiKey,
            response.status,
          ),
        );
        throw providerHttpError(response.status);
      }
      const value = await readResponseJson(response, API_LIMITS.responseBytes);
      Object.assign(
        diagnostic,
        routerDiagnostic(
          value,
          phase,
          requestedModel,
          requestedEffort,
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
    diagnostic = this.diagnostics.at(-1)!,
  ): ProviderDiagnostic {
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

  private verifyRepairUsedNoTools(response: RouterResponse): void {
    const diagnostic = this.diagnostics.at(-1)!;
    const tools = response.usage?.server_tool_use;
    if (
      (tools?.web_search_requests ?? 0) !== 0 ||
      (tools?.web_fetch_requests ?? 0) !== 0
    ) {
      diagnostic.repair_validation = "unexpected_tool_use";
      throw new IngestionError("unexpected_repair_tools");
    }
  }

  private async repairCandidates(
    content: string,
    original: unknown[],
    sources: SourceIdentity[],
    signal: AbortSignal,
  ): Promise<{ candidates: unknown[]; metadata: Record<string, Json> }> {
    if (content.length > API_LIMITS.repairInputCharacters)
      throw new IngestionError("repair_input_too_large");
    const response = await this.request(
      "repair",
      {
        messages: [
          { role: "system", content: REPAIR_INSTRUCTIONS },
          { role: "user", content: repairInput(content, sources) },
        ],
        max_tokens: API_LIMITS.repairOutputTokens,
        response_format: candidateResponseFormat(sources.length),
      },
      signal,
      this.repairModel,
      this.repairEffort,
    );
    this.verifyRepairUsedNoTools(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.choices[0].message.content ?? "");
    } catch {
      this.diagnostics.at(-1)!.repair_validation = "invalid_json";
      throw new IngestionError("invalid_repair_json");
    }
    const diagnostic = this.diagnostics.at(-1)!;
    const candidates = extractionCandidates(parsed, diagnostic);
    const complete = candidates
      ? hasCompleteSourceCoverage(candidates, sources, diagnostic)
      : false;
    if (!candidates) {
      diagnostic.repair_validation = "invalid_shape";
      throw new IngestionError("invalid_repair_output");
    }
    if (diagnostic.extraction_candidate_format !== "canonical") {
      diagnostic.repair_validation = "invalid_format";
      throw new IngestionError("invalid_repair_output");
    }
    if (!complete) {
      diagnostic.repair_validation = "invalid_coverage";
      throw new IngestionError("invalid_repair_output");
    }
    if (!repairPreservesCandidateScalars(original, candidates)) {
      diagnostic.repair_validation = "scalar_preservation_failed";
      throw new IngestionError("invalid_repair_output");
    }
    diagnostic.repair_validation = "accepted";
    return {
      candidates,
      metadata: routerMetadata(
        response,
        this.repairModel,
        this.repairEffort,
        diagnostic,
      ) as Record<string, Json>,
    };
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
      metadata: routerMetadata(response, this.model, this.effort, diagnostic),
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
        response_format: candidateResponseFormat(sources.length),
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
    let candidates = extractionCandidates(parsed, responseDiagnostic);
    let completeSourceCoverage = candidates
      ? hasCompleteSourceCoverage(candidates, sources, responseDiagnostic)
      : false;
    // Preserve per-candidate validation so one malformed sibling cannot erase good evidence.
    if (!candidates || candidates.length !== sources.length)
      throw new IngestionError("invalid_extraction_shape");
    const reportedTools = response.usage?.server_tool_use;
    if (
      (reportedTools?.web_search_requests ?? 0) !== 0 ||
      reportedTools?.web_fetch_requests != null
    ) {
      this.verifyExtractionFetch(
        response,
        sources.length,
        completeSourceCoverage,
        responseDiagnostic,
      );
    }
    let repairMetadata: Record<string, Json> | null = null;
    if (
      !completeSourceCoverage &&
      hasRepairableSourceCoverage(candidates, sources, responseDiagnostic)
    ) {
      const repaired = await this.repairCandidates(
        response.choices[0].message.content ?? "",
        candidates,
        sources,
        signal,
      );
      candidates = repaired.candidates;
      repairMetadata = repaired.metadata;
      completeSourceCoverage = true;
    }
    const verifiedDiagnostic = this.verifyExtractionFetch(
      response,
      sources.length,
      completeSourceCoverage,
      responseDiagnostic,
    );
    const metadata = routerMetadata(
      response,
      this.model,
      this.effort,
      verifiedDiagnostic,
    ) as Record<string, Json>;
    return {
      candidates,
      metadata: repairMetadata
        ? { ...metadata, repair_applied: true, repair: repairMetadata }
        : metadata,
    };
  }
}
