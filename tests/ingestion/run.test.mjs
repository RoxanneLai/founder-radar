import assert from "node:assert/strict";
import test from "node:test";
import { runIngestion } from "../../lib/ingestion/run.ts";
import { IngestionError } from "../../lib/ingestion/errors.ts";
import {
  candidate,
  fact,
  fakeProvider,
  memoryRepository,
  options,
  url,
} from "./helpers.mjs";

function dependencies(
  repository = memoryRepository(),
  provider = fakeProvider(),
) {
  return { repository, provider, signal: new AbortController().signal };
}

test("saves three draft candidates with provenance, then reruns without duplicate sources/events", async () => {
  const urls = [url, "https://luma.com/second", "https://luma.com/third"];
  const repo = memoryRepository();
  const deps = dependencies(repo, fakeProvider(urls.map(candidate), urls));
  deps.now = () => new Date("2026-09-01T12:00:00Z");
  const first = await runIngestion(options, deps);
  assert.equal(first.status, "succeeded");
  assert.equal(first.sources_created, 3);
  assert.equal(first.events_written, 3);
  deps.now = () => new Date("2026-09-02T12:00:00Z");
  const second = await runIngestion(options, deps);
  assert.equal(second.sources_created, 0);
  assert.equal(second.sources_updated, 3);
  assert.equal(repo.events.size, 3);
  assert.equal(repo.sources.get(url).first_seen_at, "2026-09-01T12:00:00.000Z");
  assert.equal(repo.sources.get(url).last_seen_at, "2026-09-02T12:00:00.000Z");
  assert.equal(repo.sources.get(url).discovered_by_run_id, first.run_id);
  assert.equal(
    repo.sources.get(url).raw_payload.evidence_kind,
    "model_web_search_report",
  );
});

test("a malformed candidate stays unlinked while a valid sibling succeeds", async () => {
  const second = "https://luma.com/second";
  const repo = memoryRepository();
  const result = await runIngestion(
    options,
    dependencies(
      repo,
      fakeProvider(
        [{ ...candidate(), starts_at: fact(null) }, candidate(second)],
        [url, second],
      ),
    ),
  );
  assert.equal(result.status, "partial");
  assert.equal(result.events_written, 1);
  assert.equal(result.sources_unlinked, 1);
  assert.equal(repo.sources.get(url).event_id, null);
});

test("failed extraction preserves earlier successful evidence and links", async () => {
  const repo = memoryRepository();
  await runIngestion(options, dependencies(repo));
  const before = structuredClone(repo.sources.get(url));
  const provider = fakeProvider();
  provider.extract = async () => {
    throw new IngestionError("provider_quota_or_rate_limit");
  };
  const result = await runIngestion(options, dependencies(repo, provider));
  assert.equal(result.status, "partial");
  const after = repo.sources.get(url);
  assert.equal(after.content_text, before.content_text);
  assert.equal(after.fetched_at, before.fetched_at);
  assert.equal(after.event_id, before.event_id);
  assert.equal(after.last_attempt_error, "provider_quota_or_rate_limit");
  assert.ok(repo.runs[1].metadata.research_report);
});

test("duplicate model candidates and uncited URLs cannot create events", async () => {
  const result = await runIngestion(
    options,
    dependencies(
      memoryRepository(),
      fakeProvider([
        candidate(),
        candidate(),
        candidate("https://luma.com/not-consulted"),
      ]),
    ),
  );
  assert.equal(result.events_written, 0);
  assert.ok(result.errors.includes("duplicate_candidate"));
  assert.ok(result.errors.includes("untrusted_candidate_url"));
});

test("zero candidates finishes cleanly without making an extraction call", async () => {
  const provider = fakeProvider([], []);
  provider.extract = async () => {
    assert.fail("unexpected extraction call");
  };
  const result = await runIngestion(
    options,
    dependencies(memoryRepository(), provider),
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.sources_discovered, 0);
});

test("provider failure closes the run with safe diagnostics, never raw secrets", async () => {
  const repo = memoryRepository();
  const provider = fakeProvider();
  provider.research = async () => {
    throw new Error("secret-test-key must not be logged");
  };
  const result = await runIngestion(options, dependencies(repo, provider));
  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["unexpected_error"]);
  assert.ok(!JSON.stringify(repo.runs).includes("secret-test-key"));
});

test("cancellation closes an active run and an already-aborted run writes nothing", async () => {
  const controller = new AbortController();
  const repo = memoryRepository();
  const provider = fakeProvider();
  const research = provider.research;
  provider.research = async () => {
    controller.abort();
    return research();
  };
  const deps = { ...dependencies(repo, provider), signal: controller.signal };
  const result = await runIngestion(options, deps);
  assert.equal(result.status, "cancelled");
  assert.equal(repo.sources.size, 0);
  await assert.rejects(runIngestion(options, deps), /run_cancelled/);
  assert.equal(repo.runs.length, 1);
});

test("database start failure prevents paid requests; finish failure surfaces", async () => {
  const repo = memoryRepository();
  repo.start = async () => {
    throw new IngestionError("run_start_failed");
  };
  const provider = fakeProvider();
  provider.research = async () => assert.fail("research must not run");
  await assert.rejects(
    runIngestion(options, dependencies(repo, provider)),
    /run_start_failed/,
  );
  const other = memoryRepository();
  other.finish = async () => {
    throw new IngestionError("run_finish_failed");
  };
  await assert.rejects(
    runIngestion(options, dependencies(other)),
    /run_finish_failed/,
  );
});

test("failed extraction counts newly discovered unlinked sources accurately", async () => {
  const repo = memoryRepository();
  const provider = fakeProvider();
  provider.extract = async () => {
    throw new IngestionError("provider_request_failed");
  };
  const result = await runIngestion(options, dependencies(repo, provider));
  assert.equal(result.sources_unlinked, 1);
  assert.equal(result.events_written, 0);
  assert.equal(result.status, "partial");
});

test("local progress-write failure does not leave the database run open", async () => {
  const repo = memoryRepository();
  const deps = dependencies(repo);
  deps.onProgress = async () => {
    throw new Error("disk full");
  };
  const result = await runIngestion(options, deps);
  assert.equal(result.status, "partial");
  assert.ok(result.errors.includes("progress_write_failed"));
  assert.equal(repo.runs[0].summary.status, "partial");
});

test("failed finalization leaves an accurate recovery checkpoint", async () => {
  const repo = memoryRepository();
  const snapshots = [];
  repo.finish = async () => {
    throw new IngestionError("run_finish_failed");
  };
  const deps = dependencies(repo);
  deps.onProgress = async (summary) => {
    snapshots.push(structuredClone(summary));
  };
  await assert.rejects(runIngestion(options, deps), /run_finish_failed/);
  assert.equal(snapshots[0].status, "running");
  assert.equal(snapshots.at(-1).status, "partial");
  assert.ok(snapshots.at(-1).errors.includes("run_finish_failed"));
});
