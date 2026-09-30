import { candidateSchema } from "./contracts.ts";
import { assertQuotedEventYear, resolveNycTime } from "./event-time.ts";
import { careerCandidateSchema } from "../career/contracts.ts";
import { assessCareer } from "../career/assessment.ts";
import type { EventDraft, SearchOptions, SourceIdentity } from "./contracts.ts";
import { IngestionError } from "./errors.ts";
import { sourceIdentity } from "./sources.ts";

type Fact<T> = { value: T | null; quote: string | null };

function supported<T>(fact: Fact<T>, report: string): T | null {
  if (
    fact.value === null ||
    !fact.quote?.trim() ||
    !report.includes(fact.quote)
  )
    return null;
  return fact.value;
}

function text(
  fact: Fact<string>,
  report: string,
  maxLength = 500,
): string | null {
  const value = supported(fact, report)?.trim();
  return value && value.length <= maxLength ? value : null;
}

/** Normalize only the observed spelling alias, after exact quote grounding. */
function eventFormat(fact: Fact<string>, evidence: string): string | null {
  const value = text(fact, evidence);
  return value === "in_person" ? "in-person" : value;
}

function hasCorrectOffset(value: string, timeZone: string): boolean {
  // UTC instants are unambiguous. For local offsets check DST against the zone.
  if (value.endsWith("Z")) return true;
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    local.find((p) => p.type === type)?.value;
  const localTimestamp = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?[+-]/,
  );
  const wallClock = localTimestamp
    ? localTimestamp[1] + ":" + (localTimestamp[2] ?? "00")
    : null;
  return (
    wallClock ===
    part("year") +
      "-" +
      part("month") +
      "-" +
      part("day") +
      "T" +
      part("hour") +
      ":" +
      part("minute") +
      ":" +
      part("second")
  );
}

/** Reject unknown core fields; never let the database's NYC defaults invent facts. */
export function normalizeCandidate(
  input: unknown,
  source: SourceIdentity,
  report: string,
  options: SearchOptions,
  observedAt: string,
): EventDraft {
  const parsed =
    options.profile === "career"
      ? careerCandidateSchema.safeParse(input)
      : candidateSchema.safeParse(input);
  if (!parsed.success) throw new IngestionError("invalid_candidate");
  const c = parsed.data;
  if (sourceIdentity(c.source_url)?.source_url !== source.source_url)
    throw new IngestionError("source_mismatch");
  if (c.source_verification.status === "rejected") {
    throw new IngestionError(c.source_verification.reason!);
  }
  if (
    options.profile !== "career" &&
    supported(c.relevant_to_founders, report) !== true
  )
    throw new IngestionError("irrelevant_event");
  const title = text(c.title, report, 300);
  const startText = text(c.starts_at, report);
  const statedTimeZone = text(c.time_zone, report);
  if (c.time_zone.value !== null && !statedTimeZone)
    throw new IngestionError("invalid_event_timezone");
  const timeZone = statedTimeZone ?? "America/New_York";
  const city = text(c.city, report);
  const region = text(c.region, report);
  const country = text(c.country_code, report);
  const format = eventFormat(c.event_format, report);
  if (!title || !startText || !city || !region || !country || !format) {
    throw new IngestionError("incomplete_event");
  }
  if (!c.title.quote?.toLocaleLowerCase().includes(title.toLocaleLowerCase())) {
    throw new IngestionError("unsupported_title");
  }
  if (
    ![
      "New York",
      "New York City",
      "NYC",
      "Brooklyn",
      "Queens",
      "Bronx",
      "Manhattan",
      "Staten Island",
    ].includes(city) ||
    !["NY", "New York"].includes(region) ||
    country !== "US" ||
    !/\b(NYC|New York|Brooklyn|Queens|Bronx|Manhattan|Staten Island)\b/i.test(
      c.city.quote ?? "",
    )
  ) {
    throw new IngestionError("outside_search_location");
  }
  if (!["in-person", "hybrid"].includes(format))
    throw new IngestionError("unsupported_event_format");
  if (timeZone !== "America/New_York") {
    throw new IngestionError("invalid_event_timezone");
  }
  const startsAt = resolveNycTime(startText);
  assertQuotedEventYear(startsAt, c.starts_at.quote!);
  const start = Date.parse(startsAt);
  if (start < Date.parse(options.from) || start >= Date.parse(options.to))
    throw new IngestionError("outside_search_window");
  if (start <= Date.parse(observedAt))
    throw new IngestionError("event_already_started");
  const endText = text(c.ends_at, report);
  let endsAt: string | null = null;
  try {
    endsAt = endText ? resolveNycTime(endText) : null;
  } catch {
    throw new IngestionError("invalid_event_end");
  }
  if (
    endText &&
    (!endsAt ||
      Date.parse(endsAt) <= start ||
      (/[+-]\d{2}:\d{2}$/.test(endText) &&
        !hasCorrectOffset(endText, timeZone)))
  ) {
    throw new IngestionError("invalid_event_end");
  }
  const amount = supported(c.price_amount_cents, report);
  const currency = text(c.currency_code, report);
  const hasPrice =
    amount !== null &&
    currency !== null &&
    /^[A-Z]{3}$/.test(currency) &&
    new RegExp("\\b" + currency + "\\b", "i").test(c.currency_code.quote ?? "");
  const registration = text(c.registration_status, report);
  const normalizationNotes = [
    ...(!statedTimeZone ? ["timezone_inferred_nyc"] : []),
    ...(text(c.event_format, report) === "in_person"
      ? ["event_format_normalized_in_person"]
      : []),
  ];
  const event: EventDraft = {
    ...(normalizationNotes.length
      ? { normalization_notes: normalizationNotes }
      : {}),
    title,
    organizer_name: text(c.organizer_name, report),
    starts_at: startsAt,
    ends_at: endsAt,
    time_zone: timeZone,
    venue_name: text(c.venue_name, report),
    address_line: text(c.address_line, report),
    city: "New York",
    region: "NY",
    country_code: "US",
    event_format: format,
    price_amount_cents: hasPrice ? amount : null,
    currency_code: hasPrice ? currency : null,
    registration_status:
      registration &&
      ["open", "almost-full", "waitlist", "closed", "cancelled"].includes(
        registration,
      )
        ? registration
        : "unknown",
  };
  if (options.profile === "career") {
    if (!options.career_target || !("career" in c))
      throw new IngestionError("invalid_career_config");
    event.career_assessment = assessCareer(
      c.career,
      report,
      event,
      options.career_target,
    );
  }
  return event;
}
