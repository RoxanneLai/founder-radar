import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { parseIngestionArgs } from "../../lib/ingestion/cli.ts";
import { validateSearchOptions } from "../../lib/ingestion/options.ts";
import { IngestionError } from "../../lib/ingestion/errors.ts";
import {
  collectDiscoveryExclusions,
  discoveryExclusionPlan,
  safeDiscoveryExclusions,
} from "../../lib/ingestion/exclusions.ts";
import { runIngestion } from "../../lib/ingestion/run.ts";
import { SqliteIngestionRepository } from "../../lib/ingestion/sqlite-repository.ts";
import { SupabaseIngestionRepository } from "../../lib/ingestion/repository.ts";
import {
  executeSqliteInspection,
  runInspectionCli,
} from "../../lib/ingestion/inspection.ts";
import { openSqliteDatabase } from "../../lib/storage/sqlite.ts";
import { sourceIdentity } from "../../lib/ingestion/sources.ts";
import { readCareerTarget } from "../../lib/career/profile.ts";
import {
  candidate,
  fakeProvider,
  memoryRepository,
  options,
  report,
  url,
} from "./helpers.mjs";

const now = new Date("2026-09-01T12:00:00Z");
const signal = new AbortController().signal;
const dependencies = (repository, provider = fakeProvider()) => ({
  repository,
  provider,
  signal,
  now: () => now,
});

test("discovery intent is opt-in, strict, independent of profile, and historical options stay refresh", () => {
  assert.equal(parseIngestionArgs([], now).options.intent, undefined);
  assert.equal(
    discoveryExclusionPlan(validateSearchOptions(options)).intent,
    "refresh",
  );
  for (const profile of ["founder", "career"])
    for (const intent of ["refresh", "expand"])
      assert.equal(
        parseIngestionArgs(["--profile", profile, "--intent", intent], now)
          .options.intent,
        intent,
      );
  for (const args of [
    ["--intent"],
    ["--intent", ""],
    ["--intent", "unknown"],
    ["--intent", "EXPAND"],
    ["--intent", "expand", "--intent", "refresh"],
  ])
    assert.throws(
      () => parseIngestionArgs(args, now),
      /^IngestionError: invalid_cli_arguments$/,
    );
  for (const intent of [null, true, "", "unknown"])
    assert.throws(
      () => validateSearchOptions({ ...options, intent }),
      /invalid_search_options/,
    );
  assert.throws(
    () => validateSearchOptions({ ...options, intent: "expand", extra: true }),
    /invalid_search_options/,
  );
  const plan = discoveryExclusionPlan({ ...options, intent: "expand" });
  assert.equal(plan.maximum_sources, 50);
  assert.equal(plan.total_source_count, null);
  assert.equal(plan.truncated, null);
});

test("refresh never queries linked events and cancelled exclusions retain their historical scope", async () => {
  const repository = memoryRepository();
  repository.listLinkedSourceUrls = async () =>
    assert.fail("refresh must not query linked sources");
  repository.sources.set(url, {
    event_id: null,
    last_attempt_error: "source_page_cancelled",
    last_attempt_at: now.toISOString(),
  });
  repository.sources.set("https://luma.com/old-cancelled", {
    event_id: null,
    last_attempt_error: "source_page_cancelled",
    last_attempt_at: "2026-01-01T00:00:00Z",
  });
  repository.sources.set("https://luma.com/failed-lead", {
    event_id: null,
    last_attempt_error: "invalid_extraction_json",
    last_attempt_at: now.toISOString(),
  });
  const result = await collectDiscoveryExclusions(options, repository, now);
  assert.deepEqual(result.urls, [url]);
  assert.equal(result.summary.intent, "refresh");
  assert.equal(result.summary.linked_source_count, 0);
  assert.equal(result.summary.truncated, false);
});

test("expansion deduplicates aliases, prioritizes cancellation and reports combined-cap truncation", async () => {
  const calls = [];
  const repository = memoryRepository();
  repository.listRecentCancelledSourceUrls = async (since, limit) => {
    calls.push([since, limit]);
    return [
      "https://lu.ma/cancelled?utm_source=alias",
      "https://luma.com/cancelled",
      "https://example.com/untrusted",
    ];
  };
  repository.listLinkedSourceUrls = async (from, to, limit) => {
    calls.push([from, to, limit]);
    return [
      "https://lu.ma/cancelled",
      ...Array.from({ length: 49 }, (_, i) => `https://luma.com/known-${i}`),
      "https://luma.com/overflow",
    ];
  };
  const result = await collectDiscoveryExclusions(
    { ...options, intent: "expand" },
    repository,
    now,
  );
  assert.equal(result.urls.length, 50);
  assert.equal(result.urls[0], "https://luma.com/cancelled");
  assert.equal(result.summary.cancelled_source_count, 1);
  assert.equal(result.summary.linked_source_count, 49);
  assert.equal(result.summary.linked_candidates_truncated, true);
  assert.equal(result.summary.cancelled_candidates_truncated, false);
  assert.equal(result.summary.truncated, true);
  assert.equal(calls[0][1], 51);
  assert.deepEqual(calls[1], [options.from, options.to, 51]);
  assert.equal(result.urls.includes("https://luma.com/overflow"), false);
  assert.deepEqual(
    await collectDiscoveryExclusions(
      { ...options, intent: "expand" },
      repository,
      now,
    ),
    result,
  );
});

test("sentinel reads expose cancellation saturation without silently promising complete expansion", async () => {
  const repository = memoryRepository();
  repository.listRecentCancelledSourceUrls = async () =>
    Array.from({ length: 51 }, (_, i) => `https://luma.com/cancelled-${i}`);
  repository.listLinkedSourceUrls = async () => [url];
  const result = await collectDiscoveryExclusions(
    { ...options, intent: "expand" },
    repository,
    now,
  );
  assert.equal(result.urls.length, 50);
  assert.equal(result.summary.cancelled_candidates_truncated, true);
  assert.equal(result.summary.linked_candidates_truncated, true);
  assert.equal(result.summary.linked_source_count, 0);
  assert.equal(safeDiscoveryExclusions(result.summary)?.truncated, true);
});

test("expansion filters known aliases before the candidate limit while failed unlinked leads remain eligible", async () => {
  const repository = memoryRepository();
  await runIngestion(options, dependencies(repository));
  const knownSnapshot = structuredClone(repository.sources.get(url));
  const eventSnapshot = structuredClone([...repository.events]);
  const pending = "https://luma.com/pending-lead";
  repository.sources.set(pending, {
    id: "pending-source",
    event_id: null,
    last_attempt_at: now.toISOString(),
    last_attempt_error: "invalid_extraction_json",
  });
  const provider = fakeProvider(
    [candidate(pending)],
    ["https://lu.ma/founder-test?utm_source=again", pending],
  );
  provider.research = async (search, abortSignal, excluded) => {
    assert.equal(search.intent, "expand");
    assert.deepEqual(excluded, [url]);
    assert.deepEqual(repository.runs.at(-1).metadata.excluded_source_urls, [
      url,
    ]);
    return {
      report,
      urls: ["https://lu.ma/founder-test?utm_source=again", pending],
      metadata: {},
    };
  };
  const extract = provider.extract;
  provider.extract = async (research, sources, ...rest) => {
    assert.deepEqual(
      sources.map((source) => source.source_url),
      [pending],
    );
    return extract(research, sources, ...rest);
  };
  const result = await runIngestion(
    { ...options, intent: "expand", limit: 1 },
    dependencies(repository, provider),
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.events_written, 1);
  assert.equal(result.sources_discovered, 1);
  assert.deepEqual(repository.sources.get(url), knownSnapshot);
  assert.deepEqual(repository.events.get("event-0"), eventSnapshot[0][1]);
  assert.equal(result.discovery_exclusions.linked_source_count, 1);
  assert.equal(JSON.stringify(result).includes(url), false);
  assert.equal(repository.runs.at(-1).metadata.intent, "expand");
});

test("an all-known discovery succeeds for both profiles with no capture, extraction, repair, or follow-up research", async () => {
  const repository = memoryRepository();
  await runIngestion(options, dependencies(repository));
  let researchCalls = 0;
  const provider = fakeProvider();
  provider.research = async () => {
    researchCalls += 1;
    return { report, urls: [url], metadata: {} };
  };
  provider.extract = async () => assert.fail("no extraction or repair");
  const target = await readCareerTarget();
  for (const search of [
    options,
    { ...options, profile: "career", career_target: target },
  ]) {
    const result = await runIngestion(
      { ...search, intent: "expand" },
      {
        ...dependencies(repository, provider),
        captureSource: async () => assert.fail("no excluded source capture"),
      },
    );
    assert.equal(result.status, "succeeded");
    assert.equal(result.sources_discovered, 0);
    assert.equal(result.events_written, 0);
    assert.equal(result.sources_updated, 0);
  }
  assert.equal(researchCalls, 2);
});

test("known Meetup and Eventbrite external-ID aliases are skipped before capture and the limit", async () => {
  for (const [known, alias] of [
    [
      "https://meetup.com/old-group/events/123456789",
      "https://www.meetup.com/new-group/events/123456789/?utm_source=alias",
    ],
    [
      "https://eventbrite.com/e/original-tickets-123456789",
      "https://eventbrite.com/e/new-slug-tickets-123456789?utm_source=alias",
    ],
  ]) {
    const repository = memoryRepository();
    repository.sources.set(known, {
      id: "known-source",
      event_id: "known-event",
    });
    repository.events.set("known-event", {
      starts_at: "2026-09-05T22:00:00Z",
      is_fixture: false,
    });
    const provider = fakeProvider([], [alias, url]);
    provider.extract = async () =>
      assert.fail("capture fails, so no extraction");
    const captures = [];
    const result = await runIngestion(
      { ...options, intent: "expand", limit: 1 },
      {
        ...dependencies(repository, provider),
        captureSource: async (source) => {
          captures.push(source.source_url);
          throw new IngestionError("source_capture_fetch_failed");
        },
      },
    );
    assert.deepEqual(captures, [url]);
    assert.equal(result.sources_discovered, 1);
    assert.equal(result.sources_created, 1);
    assert.equal(result.sources_updated, 0);
    assert.deepEqual(result.errors, ["source_capture_fetch_failed"]);
    assert.equal(repository.sources.has(alias), false);
  }
});

test("exactly fifty candidates is not truncation when every supported identity fits", async () => {
  for (const kind of ["cancelled", "linked"]) {
    const repository = memoryRepository();
    const rows = Array.from(
      { length: 50 },
      (_, index) => `https://luma.com/boundary-${index}`,
    );
    if (kind === "cancelled")
      repository.listRecentCancelledSourceUrls = async () => rows;
    else repository.listLinkedSourceUrls = async () => rows;
    const result = await collectDiscoveryExclusions(
      { ...options, intent: "expand" },
      repository,
      now,
    );
    assert.equal(result.urls.length, 50);
    assert.equal(result.summary.truncated, false);
  }
});

test("expansion exclusion read or checkpoint failure closes the run before paid research", async () => {
  for (const failure of [
    "linked_source_exclusion_read_failed",
    "run_checkpoint_failed",
  ]) {
    const repository = memoryRepository();
    if (failure === "linked_source_exclusion_read_failed")
      repository.listLinkedSourceUrls = async () => {
        throw new IngestionError(failure);
      };
    else
      repository.checkpoint = async () => {
        throw new IngestionError(failure);
      };
    const provider = fakeProvider();
    provider.research = async () => assert.fail("must fail before research");
    const result = await runIngestion(
      { ...options, intent: "expand" },
      dependencies(repository, provider),
    );
    assert.equal(result.status, "failed");
    assert.deepEqual(result.errors, [failure]);
    assert.equal(repository.runs[0].summary.status, "failed");
  }
});

test("cancellation during expansion selection prevents paid research", async () => {
  const controller = new AbortController();
  const repository = memoryRepository();
  repository.listLinkedSourceUrls = async () => {
    controller.abort();
    return [];
  };
  const provider = fakeProvider();
  provider.research = async () => assert.fail("cancelled before research");
  const result = await runIngestion(
    { ...options, intent: "expand" },
    { ...dependencies(repository, provider), signal: controller.signal },
  );
  assert.equal(result.status, "cancelled");
  assert.deepEqual(result.errors, ["run_cancelled"]);
});

test("SQLite expansion reads linked non-fixture events in the exact half-open window without modifying records", async () => {
  await mkdir("codex-tmp", { recursive: true });
  const directory = await mkdtemp("codex-tmp/expansion-test-");
  const path = join(directory, "synthetic.sqlite");
  const repository = new SqliteIngestionRepository(
    path,
    "openai/test-model",
    "low",
    "openai/test-model",
    "low",
  );
  const runId = await repository.start(options);
  const draft = {
    title: "Synthetic linked event",
    starts_at: options.from,
    time_zone: "America/New_York",
    city: "New York",
    region: "NY",
    country_code: "US",
    event_format: "in-person",
  };
  const identities = [
    "draft",
    "published",
    "archived",
    "fixture",
    "before",
    "at-end",
    "after",
    "failed-linked",
  ];
  const records = [];
  for (const name of identities) {
    const source = sourceIdentity(`https://luma.com/${name}`);
    const starts =
      name === "before"
        ? "2026-08-31T23:59:59Z"
        : name === "at-end"
          ? options.to
          : name === "after"
            ? "2026-09-16T00:00:00Z"
            : options.from;
    records.push(
      await repository.save(
        runId,
        { ...source, content_text: "Synthetic evidence" },
        { ...draft, starts_at: starts },
        now.toISOString(),
      ),
    );
  }
  const database = openSqliteDatabase(path);
  database
    .prepare(
      "update events set publication_status = 'published', published_at = ? where id = ?",
    )
    .run(now.toISOString(), records[1].event_id);
  database
    .prepare("update events set publication_status = 'archived' where id = ?")
    .run(records[2].event_id);
  database
    .prepare("update events set is_fixture = 1 where id = ?")
    .run(records[3].event_id);
  database.close();
  await repository.save(
    runId,
    {
      ...sourceIdentity("https://luma.com/failed-linked"),
      error_code: "invalid_extraction_json",
    },
    null,
    now.toISOString(),
  );
  await repository.save(
    runId,
    {
      ...sourceIdentity("https://luma.com/unlinked-lead"),
      error_code: "invalid_extraction_json",
    },
    null,
    now.toISOString(),
  );
  const before = await readFile(path);
  const expected = [0, 1, 2, 7]
    .map((index) => ({
      id: records[index].source_id,
      url: `https://luma.com/${identities[index]}`,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => item.url);
  const selected = await repository.listLinkedSourceUrls(
    "2026-08-31T20:00:00-04:00",
    "2026-09-14T20:00:00-04:00",
    51,
  );
  assert.deepEqual(selected, expected);
  assert.deepEqual(
    await repository.listLinkedSourceUrls(options.from, options.to, 1),
    expected.slice(0, 1),
  );
  assert.deepEqual(await readFile(path), before);
  const result = await collectDiscoveryExclusions(
    { ...options, intent: "expand" },
    repository,
    now,
  );
  assert.equal(result.summary.linked_source_count, 4);
  const expandedRun = await repository.start({ ...options, intent: "expand" });
  await repository.finish(
    {
      run_id: expandedRun,
      status: "succeeded",
      sources_discovered: 0,
      sources_created: 0,
      sources_updated: 0,
      events_written: 0,
      sources_unlinked: 0,
      errors: [],
    },
    {
      summary: { discovery_exclusions: result.summary },
      excluded_source_urls: result.urls,
    },
  );
  const inspection = await runInspectionCli(["--run", expandedRun], async () =>
    executeSqliteInspection(expandedRun, path),
  );
  assert.equal(inspection.run.search_parameters.intent, "expand");
  assert.deepEqual(inspection.discovery_exclusions, result.summary);
  assert.equal(
    JSON.stringify(inspection).includes("excluded_source_urls"),
    false,
  );
  assert.equal(
    executeSqliteInspection(runId, path).run.search_parameters.intent,
    "refresh",
  );
  await assert.rejects(
    repository.listLinkedSourceUrls("invalid", options.to, 51),
    /^IngestionError: linked_source_exclusion_read_failed$/,
  );
});

test("Supabase SDK uses the same window, fixture filter, deterministic order, limit, and safe failure", async () => {
  const calls = [];
  let fail = false;
  const client = createClient("http://127.0.0.1:54321", "offline-not-a-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        calls.push({
          url: new URL(String(input)),
          method: init.method,
          body: init.body ? JSON.parse(init.body) : null,
        });
        return new Response(
          JSON.stringify(
            fail
              ? { message: "private provider error", code: "42501" }
              : init.method === "POST"
                ? { id: "run-test" }
                : init.method === "GET" &&
                    new URL(String(input)).searchParams
                      .get("select")
                      ?.includes("events!inner")
                  ? [{ source_url: url }]
                  : [],
          ),
          {
            status: fail ? 403 : 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  });
  const repository = new SupabaseIngestionRepository(client);
  assert.deepEqual(
    await repository.listLinkedSourceUrls(
      "2026-08-31T20:00:00-04:00",
      "2026-09-14T20:00:00-04:00",
      51,
    ),
    [url],
  );
  const query = calls[0].url.searchParams;
  assert.equal(calls[0].method, "GET");
  assert.equal(
    query.get("select"),
    "source_url,events!inner(starts_at,is_fixture)",
  );
  assert.equal(query.get("events.is_fixture"), "eq.false");
  assert.deepEqual(query.getAll("events.starts_at"), [
    "gte.2026-09-01T00:00:00.000Z",
    "lt.2026-09-15T00:00:00.000Z",
  ]);
  assert.equal(query.get("order"), "id.asc");
  assert.equal(query.get("limit"), "51");
  assert.equal(query.has("last_attempt_error"), false);
  await repository.start({ ...options, intent: "expand" });
  assert.equal(calls.at(-1).body.search_parameters.intent, "expand");
  await repository.start(options);
  assert.equal(calls.at(-1).body.search_parameters.intent, "refresh");
  fail = true;
  await assert.rejects(
    repository.listLinkedSourceUrls(options.from, options.to, 51),
    /^IngestionError: linked_source_exclusion_read_failed$/,
  );
});

test("safe expansion diagnostics reject URL injection, malformed counts, and inconsistent summaries", async () => {
  const { summary } = await collectDiscoveryExclusions(
    { ...options, intent: "expand" },
    memoryRepository(),
    now,
  );
  assert.deepEqual(safeDiscoveryExclusions(summary), summary);
  for (const value of [
    null,
    {},
    { ...summary, urls: [url] },
    { ...summary, total_source_count: 51 },
    { ...summary, linked_source_count: 1 },
    { ...summary, truncated: true },
    { ...summary, intent: "unknown" },
  ])
    assert.equal(safeDiscoveryExclusions(value), null);
});
