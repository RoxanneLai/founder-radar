import assert from "node:assert/strict";
import test from "node:test";
import {
  rankEvents,
  formatEventSchedule,
  formatPrice,
  scoreTier,
} from "../lib/events.ts";
import { mockEvents } from "../lib/mock-events.ts";
import { EVENT_CATEGORIES } from "../lib/types.ts";

test("ranks by networking score without changing the input", () => {
  const originalIds = mockEvents.map((event) => event.id);
  const sorted = rankEvents(mockEvents);
  assert.deepEqual(
    sorted.map((event) => event.networkingScore),
    [94, 91, 86, 84, 80, 76],
  );
  assert.deepEqual(
    mockEvents.map((event) => event.id),
    originalIds,
  );
  assert.notEqual(sorted, mockEvents);
  assert.deepEqual(rankEvents([]), []);
});

test("breaks equal scores by start time and then stable ID", () => {
  const base = mockEvents[0];
  const later = { ...base, id: "b", startsAt: "2026-09-05T18:00:00-04:00" };
  const earlier = { ...base, id: "c", startsAt: "2026-09-01T18:00:00-04:00" };
  const sameTime = { ...earlier, id: "a" };
  assert.deepEqual(
    rankEvents([later, earlier, sameTime]).map((e) => e.id),
    ["a", "c", "b"],
  );
});

test("fixtures satisfy the V0 display contract", () => {
  assert.equal(new Set(mockEvents.map((e) => e.id)).size, mockEvents.length);
  for (const event of mockEvents) {
    assert.match(event.id, /^mock-/);
    for (const score of [
      event.networkingScore,
      event.founderScore,
      event.investorScore,
    ]) {
      assert.ok(Number.isInteger(score) && score >= 0 && score <= 100);
    }
    assert.ok(Number.isFinite(event.priceUsd) && event.priceUsd >= 0);
    assert.ok(Date.parse(event.endsAt) > Date.parse(event.startsAt));
    assert.match(event.startsAt, /[+-]\d{2}:\d{2}$/);
    assert.ok(event.categories.length > 0);
    assert.ok(event.categories.every((c) => EVENT_CATEGORIES.includes(c)));
    assert.ok(event.recommendation.length > 0);
  }
});

test("formats free and paid events without dropping cents", () => {
  assert.equal(formatPrice(0), "Free");
  assert.equal(formatPrice(20), "$20");
  assert.equal(formatPrice(12.5), "$12.50");
});

test("formats the event in New York time, including daylight saving time", () => {
  assert.equal(
    formatEventSchedule(mockEvents[1]),
    "Tue, Sep 1 · 6:30 PM–9:00 PM EDT",
  );
  assert.equal(
    formatEventSchedule({
      ...mockEvents[1],
      startsAt: "2026-12-01T18:30:00-05:00",
      endsAt: "2026-12-01T21:00:00-05:00",
    }),
    "Tue, Dec 1 · 6:30 PM–9:00 PM EST",
  );
});

test("score colors match the documented thresholds", () => {
  assert.equal(scoreTier(100), "exceptional");
  assert.equal(scoreTier(90), "exceptional");
  assert.equal(scoreTier(89), "strong");
  assert.equal(scoreTier(80), "strong");
  assert.equal(scoreTier(79), "promising");
  assert.equal(scoreTier(0), "promising");
});
