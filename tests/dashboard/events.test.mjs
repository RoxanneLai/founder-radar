import assert from "node:assert/strict";
import test from "node:test";
import {
  formatEventSchedule,
  formatStoredPrice,
  rankEvents,
} from "../../lib/events.ts";
import {
  dashboardWindow,
  normalizePublishedEvents,
} from "../../lib/dashboard/normalize.ts";
import { getSampleEvents } from "../../lib/dashboard/sample.ts";
import { now, publishedRow } from "./helpers.mjs";

test("published cards preserve unknowns and project only public display fields", () => {
  const [event] = normalizePublishedEvents(
    [
      publishedRow({
        raw_payload: { secret: "private" },
        content_text: "private",
        scoring_version: "private",
        categories: ["Founder", "Founder", "unrecognized"],
      }),
    ],
    now,
  );
  assert.equal(event.networkingScore, null);
  assert.equal(event.priceAmountCents, null);
  assert.equal(event.currencyCode, null);
  assert.equal(event.organizer, null);
  assert.equal(event.recommendation, null);
  assert.equal(event.endsAt, null);
  assert.equal(event.source, null);
  assert.equal(event.isFixture, false);
  assert.equal(event.isNew, false);
  assert.deepEqual(event.categories, ["Founder"]);
  assert.doesNotMatch(
    JSON.stringify(event),
    /private|raw_payload|content_text|scoring_version/,
  );
});

test("defensive projection excludes drafts, archives, fixtures, cancelled and out-of-scope events", () => {
  for (const override of [
    { publication_status: "draft" },
    { publication_status: "archived" },
    { is_fixture: true },
    { registration_status: "cancelled" },
    { event_format: "virtual" },
    { city: "Boston" },
    { region: "NJ" },
    { country_code: "CA" },
    { starts_at: "2026-09-01T03:00:00Z" },
    { starts_at: "2026-10-02T03:00:00Z" },
  ])
    assert.deepEqual(
      normalizePublishedEvents([publishedRow(override)], now),
      [],
      JSON.stringify(override),
    );
  assert.equal(
    normalizePublishedEvents(
      [publishedRow({ event_format: "hybrid", registration_status: "closed" })],
      now,
    ).length,
    1,
  );
});

test("the window includes its start and excludes its end", () => {
  assert.deepEqual(dashboardWindow(now), {
    start: "2026-09-02T03:00:00.000Z",
    end: "2026-10-02T03:00:00.000Z",
  });
  assert.equal(
    normalizePublishedEvents(
      [publishedRow({ starts_at: now.toISOString() })],
      now,
    ).length,
    1,
  );
});

test("blank optional text is treated as unknown rather than taking the feed offline", () => {
  const [event] = normalizePublishedEvents(
    [
      publishedRow({
        venue_name: " ",
        recommendation: "",
        potential_downside: " ",
      }),
    ],
    now,
  );
  assert.equal(event.venue, null);
  assert.equal(event.recommendation, null);
  assert.equal(event.potentialDownside, null);
});

test("invalid display data fails closed instead of crashing a card or inventing facts", () => {
  for (const override of [
    { starts_at: "not a date" },
    { ends_at: "2026-09-01T01:00:00Z" },
    { time_zone: "not-a-zone" },
    { networking_score: 101 },
    { title: " " },
    { price_amount_cents: 0 },
    { currency_code: "USD" },
    { currency_code: "bad" },
  ])
    assert.throws(() =>
      normalizePublishedEvents([publishedRow(override)], now),
    );
  assert.throws(() =>
    normalizePublishedEvents(
      Array.from({ length: 52 }, () => publishedRow()),
      now,
    ),
  );
});

test("zero is a real score and unscored events follow scored events, then date and ID", () => {
  const base = { networkingScore: null, startsAt: "2026-09-10T22:00:00Z" };
  const events = [
    { ...base, id: "c" },
    { ...base, id: "b", networkingScore: 0 },
    { ...base, id: "a" },
  ];
  assert.deepEqual(
    rankEvents(events).map((event) => event.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    events.map((event) => event.id),
    ["c", "b", "a"],
  );
});

test("minor-unit prices preserve unknown, free, fractional USD and other currencies", () => {
  assert.equal(formatStoredPrice(null, null), "Price not listed");
  assert.equal(formatStoredPrice(0, null), "Price not listed");
  assert.equal(formatStoredPrice(0, "USD"), "Free");
  assert.equal(formatStoredPrice(1250, "USD"), "$12.50");
  assert.equal(formatStoredPrice(2000, "USD"), "$20");
  assert.equal(formatStoredPrice(500, "JPY"), "¥500");
  assert.match(formatStoredPrice(1250, "KWD"), /1\.250/);
});

test("schedule formatting handles missing end times and events crossing midnight", () => {
  const base = {
    startsAt: "2026-09-10T22:00:00Z",
    endsAt: null,
    timeZone: "America/New_York",
  };
  assert.equal(
    formatEventSchedule(base),
    "Thu, Sep 10 · 6:00 PM EDT · End time not listed",
  );
  assert.match(
    formatEventSchedule({ ...base, endsAt: "2026-09-11T05:00:00Z" }),
    /Sep 11.*1:00 AM EDT/,
  );
});

test("sample edition remains deterministic, explicit, and independent of the database", () => {
  const events = getSampleEvents();
  assert.equal(events.length, 6);
  assert.ok(
    events.every((event) => event.isFixture && event.id.startsWith("mock-")),
  );
  assert.deepEqual(
    events.map((event) => event.networkingScore),
    [94, 91, 86, 84, 80, 76],
  );
});
