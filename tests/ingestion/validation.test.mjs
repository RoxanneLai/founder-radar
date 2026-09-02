import assert from "node:assert/strict";
import test from "node:test";
import { sourceIdentity, selectSources } from "../../lib/ingestion/sources.ts";
import { normalizeCandidate } from "../../lib/ingestion/normalize.ts";
import {
  validateSearchOptions,
  defaultSearchOptions,
} from "../../lib/ingestion/options.ts";
import { parseIngestionArgs } from "../../lib/ingestion/cli.ts";
import { readIngestionConfig } from "../../lib/ingestion/config.ts";
import { candidate, fact, report, url, options } from "./helpers.mjs";

const normalize = (input, window = options) =>
  normalizeCandidate(input, sourceIdentity(url), report, window);

test("canonicalizes listing URLs without merging meaningful query parameters", () => {
  assert.equal(
    sourceIdentity("https://www.lu.ma/founder-test/?utm_source=x#details")
      .source_url,
    url,
  );
  assert.equal(
    sourceIdentity("https://luma.com/founder-test?event=2").source_url,
    url + "?event=2",
  );
  assert.equal(
    sourceIdentity("https://www.meetup.com/group/events/123/").external_id,
    "123",
  );
  assert.equal(
    sourceIdentity("https://eventbrite.com/e/founders-tickets-123").external_id,
    "123",
  );
});

test("rejects arbitrary hosts, credentials, non-HTTPS URLs and non-listing pages", () => {
  for (const input of [
    "http://luma.com/foo",
    "https://127.0.0.1/foo",
    "https://localhost/foo",
    "https://luma.com.evil.test/foo",
    "https://evil.luma.com/foo",
    "https://me:lame@luma.com/foo",
    "file:///etc/passwd",
    "https://luma.com:123/foo",
    "https://luma.com/discover",
    "https://luma.com/",
    "https://meetup.com/find",
    "https://eventbrite.com/d/ny--new-york/events/",
  ])
    assert.equal(sourceIdentity(input), null, input);
});

test("deduplicates source aliases, external IDs and tracking URLs before applying the limit", () => {
  assert.equal(
    selectSources(
      [
        url,
        url + "?utm_source=x",
        "https://lu.ma/founder-test",
        "https://luma.com/second",
      ],
      1,
    ).length,
    1,
  );
  assert.equal(
    selectSources(
      ["https://meetup.com/a/events/12", "https://meetup.com/b/events/12"],
      10,
    ).length,
    1,
  );
});

test("normalizes a supported event without adding scores or publication privileges", () => {
  const result = normalize(candidate());
  assert.equal(result.starts_at, "2026-09-05T22:00:00.000Z");
  assert.equal(result.price_amount_cents, 1250);
  assert.equal(result.currency_code, "USD");
  assert.equal(result.venue_name, null);
  assert.equal("publication_status" in result, false);
  assert.equal("founder_score" in result, false);
});

test("unknown or unsupported optional fields stay unknown; missing core fields stay unlinked", () => {
  const c = candidate();
  c.organizer_name = fact("Invented Organizer", "this is not in the report");
  c.price_amount_cents = fact(null);
  c.registration_status = fact("made-up");
  const result = normalize(c);
  assert.equal(result.organizer_name, null);
  assert.equal(result.price_amount_cents, null);
  assert.equal(result.currency_code, null);
  assert.equal(result.registration_status, "unknown");
  c.starts_at = fact(null);
  assert.throws(() => normalize(c), /incomplete_event/);
});

test("free requires an explicit supported zero and currency", () => {
  const c = candidate();
  c.price_amount_cents = fact(0);
  assert.equal(normalize(c).price_amount_cents, 0);
  c.currency_code = fact(null);
  assert.equal(normalize(c).price_amount_cents, null);
  c.currency_code = fact("USD", "Tickets are 12.50");
  assert.equal(normalize(c).currency_code, null);
});

test("accepts ISO timestamps with omitted seconds and checks winter offsets", () => {
  assert.equal(
    normalize({ ...candidate(), starts_at: fact("2026-09-05T18:00-04:00") })
      .starts_at,
    "2026-09-05T22:00:00.000Z",
  );
  const winter = {
    ...options,
    from: "2026-12-01T00:00:00Z",
    to: "2026-12-15T00:00:00Z",
  };
  const c = {
    ...candidate(),
    starts_at: fact("2026-12-05T18:00:00-05:00"),
    ends_at: fact(null),
  };
  assert.equal(normalize(c, winter).starts_at, "2026-12-05T23:00:00.000Z");
  c.starts_at = fact("2026-12-05T18:00:00-04:00");
  assert.throws(() => normalize(c, winter), /invalid_event_timezone/);
});

test("rejects invented titles, invalid dates, DST mismatch, and backwards duration", () => {
  assert.throws(
    () => normalize({ ...candidate(), title: fact("Invented Event") }),
    /unsupported_title/,
  );
  assert.throws(
    () =>
      normalize({
        ...candidate(),
        starts_at: fact("2026-02-30T18:00:00-04:00"),
      }),
    /incomplete_event/,
  );
  assert.throws(
    () =>
      normalize({
        ...candidate(),
        starts_at: fact("2026-09-05T18:00:00-05:00"),
      }),
    /invalid_event_timezone/,
  );
  assert.throws(
    () =>
      normalize({ ...candidate(), ends_at: fact("2026-09-05T17:00:00-04:00") }),
    /invalid_event_end/,
  );
  assert.throws(
    () => normalize({ ...candidate(), starts_at: fact("2026-09-05") }),
    /incomplete_event/,
  );
});

test("rejects non-NYC, virtual, irrelevant, out-of-range and mismatched-source listings", () => {
  assert.throws(
    () => normalize({ ...candidate(), city: fact("Boston") }),
    /outside_search_location/,
  );
  assert.throws(
    () => normalize({ ...candidate(), event_format: fact("virtual") }),
    /unsupported_event_format/,
  );
  assert.throws(
    () => normalize({ ...candidate(), relevant_to_founders: fact(false) }),
    /irrelevant_event/,
  );
  assert.throws(
    () =>
      normalize({
        ...candidate(),
        starts_at: fact("2026-09-15T00:00:00Z"),
        ends_at: fact(null),
      }),
    /outside_search_window/,
  );
  assert.throws(
    () => normalize({ ...candidate(), source_url: "https://luma.com/other" }),
    /source_mismatch/,
  );
});

test("search windows and candidate limits are bounded", () => {
  assert.deepEqual(validateSearchOptions(options), options);
  assert.equal(
    defaultSearchOptions(new Date("2026-09-01T00:00:00Z")).to,
    "2026-09-15T00:00:00.000Z",
  );
  for (const limit of [0, -1, 11, 1.5])
    assert.throws(() => validateSearchOptions({ ...options, limit }));
  assert.throws(() => validateSearchOptions({ ...options, to: options.from }));
  assert.throws(() =>
    validateSearchOptions({ ...options, to: "2026-12-01T00:00:00Z" }),
  );
});

test("CLI defaults to a no-network plan and fails closed on malformed arguments", () => {
  assert.equal(parseIngestionArgs([]).live, false);
  assert.equal(parseIngestionArgs(["--live"]).live, true);
  assert.equal(parseIngestionArgs(["--help"]).help, true);
  for (const args of [
    ["--limit", "11"],
    ["--limit", "1e1"],
    ["--form", "x"],
    ["--from", options.from],
  ]) {
    assert.throws(() => parseIngestionArgs(args));
  }
});

test("live database configuration requires paid opt-in and local-only credentials", () => {
  const env = {
    FOUNDER_RADAR_ALLOW_PAID_API: "1",
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
  };
  assert.equal(readIngestionConfig(env).supabaseUrl, "http://127.0.0.1:54321");
  assert.throws(() => readIngestionConfig({}), /paid_api_not_enabled/);
  assert.throws(
    () => readIngestionConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: "" }),
    /missing_ingestion_environment/,
  );
  for (const dbUrl of [
    "https://project.supabase.co",
    "http://localhost.evil:54321",
    "http://user:pass@localhost:54321",
    "http://localhost:54321/path",
  ]) {
    assert.throws(
      () => readIngestionConfig({ ...env, SUPABASE_URL: dbUrl }),
      /local_database_required/,
    );
  }
});
