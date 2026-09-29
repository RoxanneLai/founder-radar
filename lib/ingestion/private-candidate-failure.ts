import "server-only";
import type { Json } from "../database.types.ts";

const MAX_FIELDS = 256;
const MAX_STRING = 4000;
const MAX_TEXT = 12000;
const MAX_ITEMS = 10;
const eventFacts = [
  "relevant_to_founders",
  "title",
  "organizer_name",
  "starts_at",
  "ends_at",
  "time_zone",
  "venue_name",
  "address_line",
  "city",
  "region",
  "country_code",
  "event_format",
  "price_amount_cents",
  "currency_code",
  "registration_status",
];
const careerFacts = [
  "kind",
  "product_relevance",
  "delivery_relevance",
  "domain",
  "eligibility",
  "interaction",
  "hiring",
  "startup_context",
];
type Capture = {
  fields: Json[];
  remaining: number;
  truncated: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Capture only canonical scalar fields; never traverse unknown provider keys. */
function captureScalar(state: Capture, path: string, input: unknown): void {
  if (state.fields.length >= MAX_FIELDS) {
    state.truncated = true;
    return;
  }
  if (typeof input === "string") {
    const value = input.slice(0, Math.min(MAX_STRING, state.remaining));
    const truncated = value.length < input.length;
    state.remaining -= value.length;
    state.truncated ||= truncated;
    state.fields.push({ path, type: "string", value, truncated });
    return;
  }
  if (
    input === null ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isFinite(input))
  ) {
    state.fields.push({
      path,
      type: input === null ? "null" : typeof input,
      value: input,
    });
    return;
  }
  state.fields.push({
    path,
    type:
      input === undefined
        ? "missing"
        : Array.isArray(input)
          ? "array"
          : typeof input === "object"
            ? "object"
            : "invalid",
  });
}

function captureFact(state: Capture, path: string, input: unknown): void {
  const fact = record(input);
  if (!fact) return captureScalar(state, path, input);
  for (const key of ["value", "quote"])
    captureScalar(state, path + "." + key, fact[key]);
}

function captureList(
  state: Capture,
  path: string,
  input: unknown,
  people = false,
): void {
  if (!Array.isArray(input)) return captureScalar(state, path, input);
  if (input.length > MAX_ITEMS) state.truncated = true;
  for (const [index, item] of input.slice(0, MAX_ITEMS).entries()) {
    const itemPath = path + "." + index;
    const person = people ? record(item) : null;
    if (!person) captureFact(state, itemPath, item);
    else
      for (const key of ["name", "company", "role", "participation"])
        captureFact(state, itemPath + "." + key, person[key]);
  }
}

/** Bounded private snapshot, separate from console summaries and good source evidence. */
export function privateCandidateFailure(
  sourceId: string,
  errorCode: string,
  observedAt: string,
  candidates: unknown[],
): Json {
  const state: Capture = { fields: [], remaining: MAX_TEXT, truncated: false };
  const candidate = candidates.length === 1 ? record(candidates[0]) : null;
  if (candidate) {
    const verdict = record(candidate.source_verification);
    if (verdict)
      for (const key of ["status", "reason"])
        captureScalar(state, "source_verification." + key, verdict[key]);
    else
      captureScalar(
        state,
        "source_verification",
        candidate.source_verification,
      );
    for (const key of eventFacts) captureFact(state, key, candidate[key]);
    const career = record(candidate.career);
    if (career) {
      for (const key of careerFacts)
        captureFact(state, "career." + key, career[key]);
      for (const key of ["restrictions", "prerequisites"])
        captureList(state, "career." + key, career[key]);
      for (const key of ["people", "founders"])
        captureList(state, "career." + key, career[key], true);
    } else captureScalar(state, "career", candidate.career);
  } else if (candidates.length === 1)
    captureScalar(state, "candidate", candidates[0]);
  return {
    version: "candidate-failure-v1",
    source_id: sourceId,
    error_code: errorCode,
    observed_at: observedAt,
    candidate_count: candidates.length,
    fields: state.fields,
    truncated: state.truncated,
  };
}
