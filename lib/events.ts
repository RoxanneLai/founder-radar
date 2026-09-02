/** Never mutate the source. Equal scores use date, then stable ID as tie-breakers. */
export function rankEvents<
  T extends { networkingScore: number | null; startsAt: string; id: string },
>(events: readonly T[]): T[] {
  return [...events].sort(
    (a, b) =>
      (b.networkingScore ?? -1) - (a.networkingScore ?? -1) ||
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      a.id.localeCompare(b.id, "en"),
  );
}

export function formatEventSchedule(event: {
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
}): string {
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
  if (!event.endsAt) {
    return `${date} · ${new Intl.DateTimeFormat("en-US", { ...timeOptions, timeZoneName: "short" }).format(new Date(event.startsAt))} · End time not listed`;
  }
  const endDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: event.timeZone,
  });
  const differentDay =
    endDate.format(new Date(event.startsAt)) !==
    endDate.format(new Date(event.endsAt));
  const end = new Intl.DateTimeFormat("en-US", {
    ...timeOptions,
    ...(differentDay
      ? { month: "short" as const, day: "numeric" as const }
      : {}),
    timeZoneName: "short",
  }).format(new Date(event.endsAt));
  return `${date} · ${start}–${end}`;
}

/** Stored prices are integer minor units; missing values never imply free. */
export function formatStoredPrice(
  amount: number | null,
  currency: string | null,
): string {
  if (amount === null || currency === null) return "Price not listed";
  if (amount === 0) return "Free";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const price = amount / 10 ** digits;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(price) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(price);
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
