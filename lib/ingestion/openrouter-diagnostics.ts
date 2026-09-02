import "server-only";
import type { ProviderDiagnostic } from "./contracts.ts";

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
  apiKey: string,
  httpStatus: number | null = null,
): ProviderDiagnostic {
  const body = record(value);
  const usage = record(body.usage);
  const searches = record(usage.server_tool_use).web_search_requests;
  const searchCount = count(searches);
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
    response_id: identifier(body.id, apiKey),
    model: identifier(body.model, apiKey, true),
    http_status: httpStatus,
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
      total_tokens: count(usage.total_tokens),
      cost: nonnegativeNumber(usage.cost),
    },
  };
}
