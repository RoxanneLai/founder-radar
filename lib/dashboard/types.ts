import type { EventCategory } from "../types.ts";

/** Public card data only; never source evidence, credentials, or run diagnostics. */
export type DashboardEvent = {
  id: string;
  title: string;
  organizer: string | null;
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  venue: string | null;
  neighborhood: string | null;
  borough: string | null;
  categories: readonly EventCategory[];
  priceAmountCents: number | null;
  currencyCode: string | null;
  source: string | null;
  registrationUrl: string | null;
  registrationStatus:
    "unknown" | "open" | "almost-full" | "waitlist" | "closed" | "cancelled";
  isNew: boolean;
  isFixture: boolean;
  founderScore: number | null;
  investorScore: number | null;
  networkingScore: number | null;
  recommendation: string | null;
  potentialDownside: string | null;
};

export type DashboardResult =
  | { status: "ready"; events: DashboardEvent[]; hasMore: boolean }
  | { status: "empty"; events: []; hasMore: false }
  | { status: "unconfigured" | "unavailable"; events: []; hasMore: false };
