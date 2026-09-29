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
