import { z } from "zod";
import type { CandidateValidationFailure } from "./contracts.ts";

const fields = new Set([
  "source_url",
  "source_verification",
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
  "career",
  "kind",
  "product_relevance",
  "delivery_relevance",
  "domain",
  "eligibility",
  "restrictions",
  "prerequisites",
  "people",
  "interaction",
  "hiring",
  "startup_context",
  "founders",
  "name",
  "company",
  "role",
  "participation",
  "value",
  "quote",
  "status",
  "reason",
]);
const reasons = [
  "invalid_type",
  "invalid_value",
  "too_small",
  "too_big",
  "invalid_format",
  "unrecognized_keys",
  "custom",
] as const;

/** Canonical paths and fixed codes only; rejected values/messages never leave here. */
export function validationFailure(
  sourceId: string,
  errorCode: string,
  input: unknown,
  schema: z.ZodType,
): CandidateValidationFailure {
  const parsed = schema.safeParse(input);
  const issues = parsed.success ? [] : parsed.error.issues;
  const entries = issues.map((issue) => ({
    path: issue.path.every((part) =>
      typeof part === "number"
        ? part >= 0 && part < 20
        : fields.has(String(part)),
    )
      ? issue.path.join(".") || "candidate"
      : "candidate",
    reason: reasons.includes(issue.code as (typeof reasons)[number])
      ? issue.code
      : "invalid_value",
  }));
  return {
    source_id: sourceId,
    error_code: errorCode,
    fields: entries.slice(0, 32),
    truncated: entries.length > 32,
  };
}

/** Revalidate persisted diagnostics before printing historical run data. */
export function safeValidationFailures(
  value: unknown,
): CandidateValidationFailure[] {
  if (!Array.isArray(value)) return [];
  const schema = z
    .object({
      source_id: z.string().uuid(),
      error_code: z.literal("invalid_candidate"),
      fields: z
        .array(
          z
            .object({ path: z.string().max(160), reason: z.enum(reasons) })
            .strict(),
        )
        .max(32),
      truncated: z.boolean(),
    })
    .strict();
  return value.slice(0, 10).flatMap((item) => {
    const parsed = schema.safeParse(item);
    if (
      !parsed.success ||
      parsed.data.fields.some(
        (entry) =>
          entry.path !== "candidate" &&
          entry.path
            .split(".")
            .some((part) => !fields.has(part) && !/^\d{1,2}$/.test(part)),
      )
    )
      return [];
    return [parsed.data];
  });
}
