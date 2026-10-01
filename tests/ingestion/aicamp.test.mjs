import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import test from "node:test";
import {
  ALLOWED_DOMAINS,
  sourceIdentity,
  selectSources,
} from "../../lib/ingestion/sources.ts";
import { publicListingUrl } from "../../lib/public-listing-url.ts";
import { captureSourcePage } from "../../lib/ingestion/source-capture.ts";
import { sourceRetrievalUrl } from "../../lib/ingestion/source-page.ts";
import { runIngestion } from "../../lib/ingestion/run.ts";
import { readCareerTarget } from "../../lib/career/profile.ts";
import { SqliteIngestionRepository } from "../../lib/ingestion/sqlite-repository.ts";
import { openSqliteDatabase } from "../../lib/storage/sqlite.ts";
import { executeSqliteReview } from "../../lib/review/repository.ts";
import { buildReviewReport } from "../../lib/review/report.ts";
import { loadDashboard } from "../../lib/dashboard/repository.ts";
import {
  candidate,
  fact,
  memoryRepository,
  options,
  report,
} from "./helpers.mjs";

const url = "https://aicamp.ai/event/eventdetails/W2099010101";
const other = "https://aicamp.ai/event/eventdetails/W2099010102";
const signal = new AbortController().signal;
const now = () => new Date("2026-09-01T00:00:00Z");
const resolve = async () => [{ address: "93.184.216.34", family: 4 }];

function response(text, status = 200, location) {
  return {
    status,
    headers: { "content-type": "text/html", ...(location ? { location } : {}) },
    body: Buffer.from(text),
  };
}

test("AICamp IDs canonicalize across WWW, tracking and private parameters without deriving dates", () => {
  assert.ok(ALLOWED_DOMAINS.includes("aicamp.ai"));
  const decorated =
    url.replace("https://", "https://www.") +
    "/?token=PRIVATE&utm_source=test#fragment";
  assert.deepEqual(sourceIdentity(decorated), {
    source_name: "aicamp.ai",
    source_url: url,
    external_id: "W2099010101",
  });
  assert.equal(publicListingUrl(decorated), url);
  assert.equal(
    sourceRetrievalUrl(decorated, sourceIdentity(url)),
    url.replace("https://", "https://www."),
  );
  assert.deepEqual(
    selectSources([decorated, url, other], 3).map(
      (source) => source.external_id,
    ),
    ["W2099010101", "W2099010102"],
  );
  assert.deepEqual(
    selectSources([decorated, other], 3, [url]).map(
      (source) => source.source_url,
    ),
    [other],
  );
});

test("AICamp only accepts the verified exact host, path and W-plus-ten-digits ID family", () => {
  for (const invalid of [
    "https://aicamp.ai/",
    "https://aicamp.ai/event/eventdetails/",
    "https://aicamp.ai/event/eventdetails/calendar",
    "https://aicamp.ai/event/eventdetails/login",
    "https://aicamp.ai/event/eventdetails/w2099010101",
    "https://aicamp.ai/event/eventdetails/X2099010101",
    "https://aicamp.ai/event/eventdetails/W209901010",
    "https://aicamp.ai/event/eventdetails/W20990101012",
    "https://aicamp.ai/event/eventdetails/%572099010101",
    "https://aicamp.ai/event/eventdetails/W2099010101/extra",
    "https://aicamp.ai/event/eventdetails/W2099010101-extra",
    "https://aicamp.ai/event/other/W2099010101",
    "https://aicamp.ai/community",
    "https://aicamp.ai/login",
    "https://events.aicamp.ai/event/eventdetails/W2099010101",
    "https://aicamp.ai.evil.test/event/eventdetails/W2099010101",
    "http://aicamp.ai/event/eventdetails/W2099010101",
    "https://user:PRIVATE@aicamp.ai/event/eventdetails/W2099010101",
    "https://aicamp.ai:8443/event/eventdetails/W2099010101",
  ]) {
    assert.equal(sourceIdentity(invalid), null, invalid);
    assert.equal(publicListingUrl(invalid), null, invalid);
  }
});

test("AICamp capture strips private parameters and permits only same-ID redirects without login or network fallback", async () => {
  const requests = [];
  const text =
    "<html><body><h1>Synthetic public event</h1><p>In-person discussion and networking in New York.</p></body></html>";
  const captured = await captureSourcePage(
    sourceIdentity(url),
    url + "?token=PRIVATE",
    signal,
    {
      now,
      resolve,
      request: async (target) => {
        requests.push(target.toString());
        return requests.length === 1
          ? response(
              "",
              301,
              url.replace("https://", "https://www.") + "/?token=PRIVATE",
            )
          : response(text);
      },
    },
  );
  assert.deepEqual(requests, [url, url.replace("https://", "https://www.")]);
  assert.equal(captured.source_url, url);
  assert.equal(captured.redirects, 1);
  assert.ok(captured.text.includes("Synthetic public event"));
  for (const destination of [
    other,
    "https://aicamp.ai/login",
    "https://events.aicamp.ai/event/eventdetails/W2099010101",
  ]) {
    let calls = 0;
    await assert.rejects(
      captureSourcePage(sourceIdentity(url), url, signal, {
        resolve,
        request: async () => {
          calls += 1;
          return response("", 302, destination);
        },
      }),
      { code: "source_capture_blocked_url" },
    );
    assert.equal(calls, 1);
  }
});

test("AICamp retrieval failure stays a source-only observation and never invokes extraction", async () => {
  const repository = memoryRepository();
  let captures = 0;
  const summary = await runIngestion(options, {
    repository,
    signal,
    now,
    provider: {
      async research() {
        return { report: "Synthetic discovery", urls: [url], metadata: {} };
      },
      async extract() {
        assert.fail("Failed capture must prevent extraction");
      },
    },
    captureSource: (source) =>
      captureSourcePage(source, source.source_url, signal, {
        resolve,
        request: async () => {
          captures += 1;
          return response("PRIVATE ERROR", 403);
        },
      }),
  });
  assert.equal(captures, 1);
  assert.equal(summary.events_written, 0);
  assert.equal(summary.sources_unlinked, 1);
  assert.deepEqual(summary.errors, ["source_capture_http_error"]);
  assert.ok(!JSON.stringify(summary).includes("PRIVATE ERROR"));
});

test("synthetic AICamp career ingestion deduplicates in SQLite, preserves evidence after failure, and remains private through review", async () => {
  await mkdir("codex-tmp", { recursive: true });
  const dir = await mkdtemp("codex-tmp/aicamp-test-");
  const path = dir + "/test.sqlite";
  const repository = new SqliteIngestionRepository(
    path,
    "vendor/offline",
    "medium",
    "vendor/offline",
    "medium",
  );
  const text =
    report + " Product discovery discussion. PRIVATE_AICAMP_EVIDENCE";
  const c = candidate(url);
  c.relevant_to_founders = fact(null);
  c.career = {
    kind: fact("product", "Product discovery discussion."),
    product_relevance: fact("direct", "Product discovery discussion."),
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
  const careerOptions = {
    ...options,
    profile: "career",
    searches: 3,
    career_target: await readCareerTarget(),
  };
  const provider = {
    async research() {
      return {
        report: "Synthetic discovery",
        urls: [url, url + "?utm_source=duplicate"],
        metadata: {},
      };
    },
    async extract(research, sources) {
      assert.equal(sources.length, 1);
      assert.equal(research.source_pages[0].text, text);
      return { candidates: [c], metadata: {} };
    },
  };
  const captureSource = (source) =>
    captureSourcePage(source, source.source_url, signal, {
      now,
      resolve,
      request: async () => response("<html><body>" + text + "</body></html>"),
    });
  for (let i = 0; i < 2; i += 1) {
    const result = await runIngestion(careerOptions, {
      repository,
      provider,
      signal,
      now,
      captureSource,
    });
    assert.equal(result.status, "succeeded");
    assert.equal(result.events_written, 1);
  }
  const failed = await runIngestion(careerOptions, {
    repository,
    provider,
    signal,
    now,
    captureSource: () => {
      throw new Error("Synthetic failed refresh");
    },
  });
  assert.equal(failed.events_written, 0);
  const db = openSqliteDatabase(path);
  let stored;
  try {
    assert.equal(
      db.prepare("select count(*) as total from event_sources").get().total,
      1,
    );
    assert.equal(
      db.prepare("select count(*) as total from events").get().total,
      1,
    );
    stored = db.prepare("select * from event_sources").get();
    assert.equal(stored.external_id, "W2099010101");
    assert.equal(JSON.parse(stored.raw_payload).source_page.text, text);
    const event = db.prepare("select * from events").get();
    assert.equal(event.publication_status, "draft");
    assert.equal(event.starts_at, "2026-09-05T22:00:00.000Z");
    assert.ok(event.career_assessment);
  } finally {
    db.close();
  }
  const review = executeSqliteReview(
    { command: "preview", eventId: stored.event_id, sourceId: stored.id },
    path,
  );
  const reviewed = buildReviewReport(review, now());
  assert.equal(reviewed.publicPreview.card.registrationUrl, url);
  assert.ok(
    !JSON.stringify(reviewed.publicPreview).includes("PRIVATE_AICAMP_EVIDENCE"),
  );
  assert.equal(
    (
      await loadDashboard({
        env: { SQLITE_DATABASE_PATH: path },
        now: now(),
        career: true,
      })
    ).status,
    "empty",
  );
});
