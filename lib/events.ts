import type { StartupEvent } from "./types";

/** Never mutate the source. Equal scores use date, then stable ID as tie-breakers. */
export function rankEvents(events: readonly StartupEvent[]): StartupEvent[] {
  return [...events].sort(
    (a, b) =>
      b.networkingScore - a.networkingScore ||
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      a.id.localeCompare(b.id, "en"),
  );
}

export function formatEventSchedule(event: StartupEvent): string {
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: event.timeZone,
  }).format(new Date(event.startsAt));
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timeZone,
  };
  const start = new Intl.DateTimeFormat("en-US", timeOptions).format(
    new Date(event.startsAt),
  );
  const end = new Intl.DateTimeFormat("en-US", {
    ...timeOptions,
    timeZoneName: "short",
  }).format(new Date(event.endsAt));
  return `${date} · ${start}–${end}`;
}

export function formatPrice(priceUsd: number): string {
  return priceUsd === 0
    ? "Free"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(priceUsd) ? 0 : 2,
      }).format(priceUsd);
}

export function scoreTier(
  score: number,
): "exceptional" | "strong" | "promising" {
  if (score >= 90) return "exceptional";
  if (score >= 80) return "strong";
  return "promising";
}
