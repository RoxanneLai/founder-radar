import { z } from "zod";
import { candidateSchema } from "./contracts.ts";
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

function instant(value: string | null): string | null {
  const withSeconds = value?.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/,
    "$1:00$2",
  );
  if (
    !withSeconds ||
    !z.iso.datetime({ offset: true }).safeParse(withSeconds).success
  )
    return null;
  return Number.isFinite(Date.parse(withSeconds))
    ? new Date(withSeconds).toISOString()
    : null;
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
): EventDraft {
  const parsed = candidateSchema.safeParse(input);
  if (!parsed.success) throw new IngestionError("invalid_candidate");
  const c = parsed.data;
  if (sourceIdentity(c.source_url)?.source_url !== source.source_url)
    throw new IngestionError("source_mismatch");
  if (supported(c.relevant_to_founders, report) !== true)
    throw new IngestionError("irrelevant_event");
  const title = text(c.title, report, 300);
  const startText = text(c.starts_at, report);
  const startsAt = instant(startText);
  const timeZone = text(c.time_zone, report);
  const city = text(c.city, report);
  const region = text(c.region, report);
  const country = text(c.country_code, report);
  const format = text(c.event_format, report);
  if (
    !title ||
    !startsAt ||
    !startText ||
    !city ||
    !region ||
    !country ||
    !format ||
    !timeZone
  ) {
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
  if (
    timeZone !== "America/New_York" ||
    !hasCorrectOffset(startText, timeZone)
  ) {
    throw new IngestionError("invalid_event_timezone");
  }
  const start = Date.parse(startsAt);
  if (start < Date.parse(options.from) || start >= Date.parse(options.to))
    throw new IngestionError("outside_search_window");
  const endText = text(c.ends_at, report);
  const endsAt = instant(endText);
  if (
    endText &&
    (!endsAt ||
      Date.parse(endsAt) <= start ||
      !hasCorrectOffset(endText, timeZone))
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
  return {
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
}
