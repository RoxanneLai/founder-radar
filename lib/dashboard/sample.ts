import { mockEvents } from "../mock-events.ts";
import { rankEvents } from "../events.ts";
import type { DashboardEvent } from "./types.ts";

/** Samples are opt-in on their own route and never a fallback for the database. */
export function getSampleEvents(): DashboardEvent[] {
  return rankEvents(mockEvents).map((event) => ({
    ...event,
    priceAmountCents: Math.round(event.priceUsd * 100),
    currencyCode: "USD",
    isFixture: true,
    registrationUrl: null,
    potentialDownside: event.potentialDownside ?? null,
  }));
}
