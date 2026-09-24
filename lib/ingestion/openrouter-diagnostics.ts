import "server-only";
import { REASONING_EFFORTS } from "./contracts.ts";
import type { ProviderDiagnostic, ReasoningEffort } from "./contracts.ts";

/** Inspect only known fields; never retain arbitrary keys or provider text. */
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonnegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function count(value: unknown): number | null {
  const number = nonnegativeNumber(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function effort(value: string): ReasoningEffort | null {
  return REASONING_EFFORTS.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : null;
}

function boundedArray(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length <= 100 ? value : null;
}

function accessDenial(
  body: Record<string, unknown>,
  httpStatus: number | null,
): ProviderDiagnostic["access_denial"] {
  const error = record(body.error);
  const reportedStatus = count(error.code);
  if ((reportedStatus ?? httpStatus) !== 403) return null;
  const pipeline = boundedArray(record(body.openrouter_metadata).pipeline);
  if (pipeline?.some((stage) => record(stage).type === "guardrail"))
    return "guardrail";
  const message = error.message;
  if (typeof message !== "string" || message.length > 4096) return "unknown";
  const normalized = message.toLowerCase();
  if (
    /data policy|data collection|training|zero data retention|\bzdr\b/.test(
      normalized,
    )
  )
    return "data_policy";
  if (/geograph|region|country|location/.test(normalized))
    return "geographic_restriction";
  if (/account|workspace|key|authorization|forbidden/.test(normalized))
    return "account_access";
  if (/model|provider|endpoint|permission|access/.test(normalized))
    return "model_access";
  return "unknown";
}

/** Keep bounded identifiers only, excluding reflected credentials and key-like strings. */
function identifier(
  value: unknown,
  apiKey: string,
  model = false,
): string | null {
  const pattern = model
    ? /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/
    : /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
  return typeof value === "string" &&
    value.length <= 256 &&
    pattern.test(value) &&
    !(apiKey && value.includes(apiKey)) &&
    !/sk-|eyJ/i.test(value)
    ? value
    : null;
}

/** Build an independent, allowlisted snapshot before semantic validation can throw. */
export function routerDiagnostic(
  value: unknown,
  phase: ProviderDiagnostic["phase"],
  requestedModel: string,
  requestedEffort: string,
  apiKey: string,
  httpStatus: number | null = null,
): ProviderDiagnostic {
  const body = record(value);
  const router = record(body.openrouter_metadata);
  const endpoints = record(router.endpoints);
  const availableEndpoints = boundedArray(endpoints.available);
  const pipeline = boundedArray(router.pipeline);
  const usage = record(body.usage);
  const searches = record(usage.server_tool_use).web_search_requests;
  const searchCount = count(searches);
  const fetches = record(usage.server_tool_use).web_fetch_requests;
  const fetchCount = count(fetches);
  const reasoningTokens = count(
    record(usage.completion_tokens_details).reasoning_tokens,
  );
  const choice = record(Array.isArray(body.choices) ? body.choices[0] : null);
  const message = record(choice.message);
  const finishReasons = [
    "stop",
    "length",
    "tool_calls",
    "function_call",
    "content_filter",
    "error",
  ];
  return {
    phase,
    requested_model: identifier(requestedModel, apiKey, true),
    requested_effort: effort(requestedEffort),
    response_id: identifier(body.id, apiKey),
    model: identifier(body.model, apiKey, true),
    http_status: httpStatus,
    access_denial: accessDenial(body, httpStatus),
    router_attempt: count(router.attempt),
    router_endpoint_total: count(endpoints.total),
    router_endpoint_available_count: availableEndpoints?.length ?? null,
    router_endpoint_selected_count:
      availableEndpoints?.filter((item) => record(item).selected === true)
        .length ?? null,
    router_guardrail_stage_count:
      pipeline?.filter((stage) => record(stage).type === "guardrail").length ??
      null,
    finish_reason:
      typeof choice.finish_reason === "string" &&
      finishReasons.includes(choice.finish_reason)
        ? choice.finish_reason
        : null,
    search_usage:
      searches == null
        ? "missing"
        : searchCount === null
          ? "invalid"
          : "reported",
    search_tool_calls: searchCount,
    fetch_usage:
      fetches == null
        ? "missing"
        : fetchCount === null
          ? "invalid"
          : "reported",
    fetch_tool_calls: fetchCount,
    extraction_shape: null,
    extraction_candidate_count: null,
    extraction_schema_valid_count: null,
    extraction_source_match_count: null,
    extraction_duplicate_source_count: null,
    extraction_untrusted_source_count: null,
    extraction_candidate_format: null,
    repair_validation: null,
    citation_count: Array.isArray(message.annotations)
      ? message.annotations.filter(
          (item) => record(item).type === "url_citation",
        ).length
      : null,
    tool_call_count: Array.isArray(message.tool_calls)
      ? message.tool_calls.length
      : null,
    content_characters:
      typeof message.content === "string" ? message.content.length : null,
    usage: {
      input_tokens: count(usage.prompt_tokens ?? usage.input_tokens),
      output_tokens: count(usage.completion_tokens ?? usage.output_tokens),
      reasoning_tokens: reasoningTokens,
      total_tokens: count(usage.total_tokens),
      cost: nonnegativeNumber(usage.cost),
    },
  };
}
