export const now = new Date("2026-09-02T03:00:00Z");

// Synthetic transport fixtures only; never inserted into the normal database.
export function publishedRow(overrides = {}) {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    title: "Synthetic published event",
    organizer_name: null,
    starts_at: "2026-09-10T22:00:00+00:00",
    ends_at: null,
    time_zone: "America/New_York",
    venue_name: null,
    neighborhood: null,
    borough: null,
    city: "New York",
    region: "NY",
    country_code: "US",
    event_format: "in-person",
    categories: ["Founder"],
    price_amount_cents: null,
    currency_code: null,
    registration_status: "unknown",
    publication_status: "published",
    is_fixture: false,
    founder_score: null,
    investor_score: null,
    networking_score: null,
    recommendation: null,
    potential_downside: null,
    ...overrides,
  };
}

export function fakeKey(role = "anon") {
  return [
    "test-header",
    Buffer.from(JSON.stringify({ role })).toString("base64url"),
    "test-signature",
  ].join(".");
}

export const env = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: fakeKey(),
};
