import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCandidate } from "../../lib/ingestion/normalize.ts";
import { sourceIdentity } from "../../lib/ingestion/sources.ts";
import { readCareerTarget } from "../../lib/career/profile.ts";
import { candidate, fact, url } from "./helpers.mjs";

const target = await readCareerTarget();
const observedAt = "2026-01-01T00:00:00Z";
const options = {
  from: observedAt,
  to: "2027-01-01T00:00:00Z",
  limit: 3,
};

/** Build synthetic grounded facts without borrowing a contradictory fixture date. */
function example(label, starts = "2026-10-08T15:00:00", profile = "founder") {
  const evidence = `Founder Test is an in-person meetup in New York, NY, US. Time: 3:00 - 7:00 PM ${label}. Product discovery discussion. Tickets 12.50 USD; registration open.`;
  const c = candidate();
  for (const value of Object.values(c))
    if (value && typeof value === "object" && "quote" in value)
      value.quote = value.value === null ? null : evidence;
  c.starts_at = fact(starts, evidence);
  c.ends_at = fact(null);
  c.time_zone = fact(label, `Time: 3:00 - 7:00 PM ${label}`);
  if (profile === "career") {
    c.relevant_to_founders = fact(null);
    c.career = {
      kind: fact("product", evidence),
      product_relevance: fact("direct", evidence),
      delivery_relevance: fact(null),
      domain: fact(null),
      eligibility: fact(null),
      restrictions: [],
      prerequisites: [],
      people: [],
      interaction: fact(null),
      hiring: fact(null),
      startup_context: fact(null),
      founders: [],
    };
  }
  return {
    c,
    evidence,
    options: { ...options, profile, career_target: target },
  };
}

function normalize(example) {
  return normalizeCandidate(
    example.c,
    sourceIdentity(url),
    example.evidence,
    example.options,
    observedAt,
  );
}

test("grounded Eastern labels normalize for both profiles with seasonal offsets and immutable evidence", () => {
  for (const profile of ["founder", "career"])
    for (const [label, date, expected] of [
      ["ET", "2026-10-08T15:00:00", "2026-10-08T19:00:00.000Z"],
      ["EDT", "2026-10-08T15:00:00-04:00", "2026-10-08T19:00:00.000Z"],
      ["ET", "2026-02-08T15:00:00", "2026-02-08T20:00:00.000Z"],
      ["EST", "2026-02-08T15:00:00-05:00", "2026-02-08T20:00:00.000Z"],
    ]) {
      const sample = example(label, date, profile);
      const original = structuredClone(sample.c);
      const event = normalize(sample);
      assert.equal(event.starts_at, expected);
      assert.equal(event.time_zone, "America/New_York");
      assert.deepEqual(event.normalization_notes, [
        "timezone_normalized_eastern",
      ]);
      assert.deepEqual(sample.c, original);
    }
});

test("unknown, seasonal-conflicting or ungrounded labels remain rejected", () => {
  for (const label of ["EST", "PST", "UTC", "Eastern", "et", "ET (EST)"])
    assert.throws(() => normalize(example(label)), {
      code: "invalid_event_timezone",
    });
  assert.throws(() => normalize(example("EDT", "2026-02-08T15:00:00")), {
    code: "invalid_event_timezone",
  });
  for (const quote of [
    null,
    "Time: 3:00 - 7:00 PM",
    "PRIVATE ET",
    "Time: 3:00 - 7:00 PM ETX",
  ])
    for (const profile of ["founder", "career"]) {
      const sample = example("ET", undefined, profile);
      sample.c.time_zone.quote = quote;
      if (quote?.endsWith("ETX")) sample.evidence += " " + quote;
      assert.throws(() => normalize(sample), {
        code:
          quote === null && profile === "career"
            ? "invalid_candidate"
            : "invalid_event_timezone",
      });
    }
  const conflicting = example("ET");
  conflicting.c.time_zone.quote += " (EST)";
  conflicting.evidence += " " + conflicting.c.time_zone.quote;
  assert.throws(() => normalize(conflicting), {
    code: "invalid_event_timezone",
  });
});

test("Eastern aliases do not bypass location, attendance, offsets, DST or end-time validation", () => {
  for (const [field, value, code] of [
    ["city", "Boston", "outside_search_location"],
    ["event_format", "virtual", "unsupported_event_format"],
    ["starts_at", "2026-10-08T15:00:00-05:00", "invalid_event_timezone"],
    ["starts_at", "2026-03-08T02:30:00", "ambiguous_event_time"],
    ["starts_at", "2026-11-01T01:30:00", "ambiguous_event_time"],
    ["ends_at", "2026-10-08T14:00:00", "invalid_event_end"],
    ["ends_at", "2026-10-08T19:00:00-05:00", "invalid_event_end"],
  ]) {
    const sample = example("ET");
    sample.c[field] = fact(value, sample.evidence);
    assert.throws(() => normalize(sample), { code });
  }
  const crossing = example("EDT", "2026-10-31T15:00:00");
  crossing.c.ends_at = fact("2026-11-02T15:00:00", crossing.evidence);
  assert.throws(() => normalize(crossing), { code: "invalid_event_end" });
  const expired = example("ET");
  expired.options.to = "2026-10-08T19:00:00Z";
  assert.throws(() => normalize(expired), { code: "outside_search_window" });
  assert.throws(
    () =>
      normalizeCandidate(
        example("ET").c,
        sourceIdentity(url),
        example("ET").evidence,
        options,
        "2026-10-08T19:00:00Z",
      ),
    { code: "event_already_started" },
  );
});

test("canonical and unstated zones retain the existing policy and separate provenance", () => {
  const canonical = example("America/New_York");
  assert.equal(normalize(canonical).normalization_notes, undefined);
  const missing = example("ET");
  missing.c.time_zone = fact(null);
  assert.deepEqual(normalize(missing).normalization_notes, [
    "timezone_inferred_nyc",
  ]);
});
