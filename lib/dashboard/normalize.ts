import { z } from "zod";
import { EVENT_CATEGORIES } from "../types.ts";
import { rankEvents } from "../events.ts";
import type { DashboardEvent } from "./types.ts";
import { publicListingUrl } from "../public-listing-url.ts";

export const DASHBOARD_LIMIT = 50;
export const DASHBOARD_DAYS = 30;

const timestamp = z.string().datetime({ offset: true });
const score = z.number().int().min(0).max(100).nullable();
const text = z
  .string()
  .trim()
  .nullable()
  .transform((value) => value || null);
const rowSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1),
    organizer_name: text,
    starts_at: timestamp,
    ends_at: timestamp.nullable(),
    time_zone: z.literal("America/New_York"),
    venue_name: text,
    neighborhood: text,
    borough: text,
    city: z.string(),
    region: z.string(),
    country_code: z.string(),
    event_format: z.string(),
    categories: z.array(z.string()),
    price_amount_cents: z.number().int().nonnegative().nullable(),
    currency_code: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    registration_status: z.enum([
      "unknown",
      "open",
      "almost-full",
      "waitlist",
      "closed",
      "cancelled",
    ]),
    publication_status: z.string(),
    is_fixture: z.boolean(),
    founder_score: score,
    investor_score: score,
    networking_score: score,
    recommendation: text,
    potential_downside: text,
    public_registration_url: z.string().nullable().optional(),
  })
  .refine(
    (row) =>
      row.ends_at === null ||
      Date.parse(row.ends_at) > Date.parse(row.starts_at),
  )
  .refine(
    (row) => (row.price_amount_cents === null) === (row.currency_code === null),
  );

export function dashboardWindow(now: Date): { start: string; end: string } {
  return {
    start: now.toISOString(),
    end: new Date(now.getTime() + DASHBOARD_DAYS * 86400000).toISOString(),
  };
}

type PublicEventRow = z.infer<typeof rowSchema>;

function isVisibleEvent(
  row: PublicEventRow,
  window: ReturnType<typeof dashboardWindow>,
): boolean {
  return (
    row.publication_status === "published" &&
    !row.is_fixture &&
    row.city === "New York" &&
    row.region === "NY" &&
    row.country_code === "US" &&
    ["in-person", "hybrid"].includes(row.event_format) &&
    row.registration_status !== "cancelled" &&
    Date.parse(row.starts_at) >= Date.parse(window.start) &&
    Date.parse(row.starts_at) < Date.parse(window.end)
  );
}

function toDashboardEvent(row: PublicEventRow): DashboardEvent {
  return {
    id: row.id,
    title: row.title,
    organizer: row.organizer_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timeZone: row.time_zone,
    venue: row.venue_name,
    neighborhood: row.neighborhood,
    borough: row.borough,
    categories: EVENT_CATEGORIES.filter((category) =>
      row.categories.includes(category),
    ),
    priceAmountCents: row.price_amount_cents,
    currencyCode: row.currency_code,
    source: null,
    registrationUrl:
      row.public_registration_url ===
      publicListingUrl(row.public_registration_url)
        ? (row.public_registration_url ?? null)
        : null,
    registrationStatus: row.registration_status,
    isNew: false,
    isFixture: false,
    founderScore: row.founder_score,
    investorScore: row.investor_score,
    networkingScore: row.networking_score,
    recommendation: row.recommendation,
    potentialDownside: row.potential_downside,
  };
}

/** Recheck visibility before mapping; only the explicit card allowlist leaves here. */
export function normalizePublishedEvents(
  input: unknown,
  now: Date,
): DashboardEvent[] {
  const rows = z
    .array(rowSchema)
    .max(DASHBOARD_LIMIT + 1)
    .parse(input);
  const window = dashboardWindow(now);
  return rankEvents(
    rows.filter((row) => isVisibleEvent(row, window)).map(toDashboardEvent),
  );
}
