import { z } from "zod";
import { IngestionError } from "./errors.ts";

function wallClock(instant: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

/** Normalize grounded Eastern labels only after NYC attendance and time validation. */
export function normalizeNycTimeZone(
  value: string | null,
  quote: string | null,
  instant: string,
): string {
  if (value === null || value === "America/New_York") return "America/New_York";
  if (
    !["ET", "EST", "EDT"].includes(value) ||
    !new RegExp("\\b" + value + "\\b").test(quote ?? "")
  )
    throw new IngestionError("invalid_event_timezone");
  const seasonalLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  })
    .formatToParts(new Date(instant))
    .find((part) => part.type === "timeZoneName")?.value;
  const labels = [...(quote ?? "").matchAll(/\b(?:EST|EDT)\b/g)].map(
    (match) => match[0],
  );
  if (
    (value !== "ET" && value !== seasonalLabel) ||
    labels.some((label) => label !== seasonalLabel)
  )
    throw new IngestionError("invalid_event_timezone");
  return "America/New_York";
}

/** Reject recognized explicit date years that contradict the NYC event instant. */
export function assertQuotedEventYear(instant: string, quote: string): void {
  const months =
    "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const patterns = [
    new RegExp(
      "\\b(?:" +
        months +
        ")\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b",
      "gi",
    ),
    new RegExp(
      "\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:" +
        months +
        ")\\.?[,]?\\s+(\\d{4})\\b",
      "gi",
    ),
  ];
  const years = patterns.flatMap((pattern) =>
    [...quote.matchAll(pattern)].map((match) => match[1]),
  );
  for (const match of quote.matchAll(
    /\b(\d{4})-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?/g,
  )) {
    const quotedInstant = Date.parse(match[0]);
    years.push(
      match[2] && Number.isFinite(quotedInstant)
        ? wallClock(quotedInstant).slice(0, 4)
        : match[1],
    );
  }
  const year = wallClock(Date.parse(instant)).slice(0, 4);
  if (years.length && !years.includes(year))
    throw new IngestionError("source_page_conflict");
}

/** Resolve only confirmed NYC times; reject DST gaps/overlaps and explicit conflicts. */
export function resolveNycTime(input: string): string {
  const value = input.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2}|$)/,
    "$1:00$2",
  );
  if (z.iso.datetime({ offset: true }).safeParse(value).success) {
    const instant = Date.parse(value);
    if (!Number.isFinite(instant))
      throw new IngestionError("invalid_event_timezone");
    if (!value.endsWith("Z") && wallClock(instant) !== value.slice(0, 19))
      throw new IngestionError("invalid_event_timezone");
    return new Date(instant).toISOString();
  }
  if (
    !z.iso.datetime({ local: true }).safeParse(value).success ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
  )
    throw new IngestionError("incomplete_event");
  const candidates = ["-04:00", "-05:00"]
    .map((offset) => Date.parse(value + offset))
    .filter((instant) => wallClock(instant) === value);
  if (candidates.length !== 1) throw new IngestionError("ambiguous_event_time");
  return new Date(candidates[0]).toISOString();
}
