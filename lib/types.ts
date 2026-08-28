export const EVENT_CATEGORIES = [
  "AI",
  "Founder",
  "VC",
  "Product",
  "SaaS",
  "Pitch",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type RegistrationStatus = "open" | "almost-full" | "waitlist";

/** One event card. V0 fixtures only; no discovery or model output yet. */
export type StartupEvent = {
  id: string;
  title: string;
  organizer: string;
  startsAt: string; // ISO 8601 with explicit UTC offset
  endsAt: string;
  timeZone: "America/New_York";
  venue: string;
  neighborhood: string;
  borough: "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";
  categories: readonly EventCategory[];
  priceUsd: number; // 0 means free; all V0 prices are known
  source: "Luma" | "Meetup" | "Eventbrite" | "Organizer website";
  registrationStatus: RegistrationStatus;
  isNew: boolean; // Explicit fixture flag, not a live discovery signal
  founderScore: number; // Integer 0–100
  investorScore: number;
  networkingScore: number;
  recommendation: string;
  potentialDownside?: string;
};
