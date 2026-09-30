import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  parseCaptureReplayOptions,
  runCaptureReplayCli,
} from "../../lib/ingestion/capture-replay.ts";
import { openSqliteDatabase } from "../../lib/storage/sqlite.ts";
import { candidate, options, report, url } from "./helpers.mjs";

const runId = "90000000-0000-4000-8000-000000000021";

async function temporaryDirectory() {
  await mkdir("codex-tmp", { recursive: true });
  return mkdtemp("codex-tmp/capture-replay-test-");
}

function seedRun(path) {
  const database = openSqliteDatabase(path);
  database
    .prepare(
      `insert into search_runs (
        id, agent_name, provider, search_parameters, status, started_at,
        completed_at, error_message, metadata, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      runId,
      "founder-radar-discovery",
      "openrouter-web-search",
      JSON.stringify({
        ...options,
        model: "openai/gpt-5.6-luna",
        effort: "medium",
        repair_model: "openai/gpt-5.6-luna",
        repair_effort: "medium",
      }),
      "partial",
      "2026-09-01T00:00:00.000Z",
      "2026-09-01T00:01:00.000Z",
      "invalid_extraction_shape",
      JSON.stringify({
        research_report: report,
        consulted_urls: [url],
        summary: { errors: ["invalid_extraction_shape"] },
      }),
      "2026-09-01T00:00:00.000Z",
      "2026-09-01T00:01:00.000Z",
    );
  database.close();
}

async function writeCapture(path, content) {
  await writeFile(
    path,
    JSON.stringify({
      response_id: "private-response-id",
      model: "openai/gpt-5.6-luna",
      content: JSON.stringify(content),
    }),
  );
}

async function writeManifest(path, captures, context = "original_failure") {
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      cases: [
        {
          label: "synthetic-shape",
          run_id: runId,
          capture_context: context,
          captures,
        },
      ],
    }),
  );
}

test("capture replay help and malformed arguments fail before data access", async () => {
  assert.equal(parseCaptureReplayOptions([]).command, "help");
  assert.equal(parseCaptureReplayOptions(["--help"]).command, "help");
  for (const args of [
    ["run"],
    ["replay"],
    ["run", "--manifest"],
    ["run", "--manifest", "manifest.json"],
    ["run", "--manifest", "codex-tmp/a.json", "--manifest", "codex-tmp/b.json"],
    ["run", "--manifest", "codex-tmp/a.json", "--output", "codex-tmp/a.txt"],
  ])
    assert.throws(() => parseCaptureReplayOptions(args));
  const help = await runCaptureReplayCli([], {
    DATABASE_BACKEND: "supabase",
  });
  assert.match(help.help, /no network or paid requests/);
});

test("offline replay accepts a canonical capture without private output", async () => {
  const directory = await temporaryDirectory();
  const databasePath = join(directory, "history.sqlite");
  const capturePath = join(directory, "canonical.json");
  const manifestPath = join(directory, "manifest.json");
  const outputPath = join(directory, "report.json");
  seedRun(databasePath);
  await writeCapture(capturePath, { candidates: [candidate()] });
  await writeManifest(manifestPath, [capturePath]);
  const result = await runCaptureReplayCli(
    ["run", "--manifest", manifestPath, "--output", outputPath],
    {
      DATABASE_BACKEND: "sqlite",
      SQLITE_DATABASE_PATH: databasePath,
    },
  );
  const reportText = await readFile(outputPath, "utf8");
  const information = await stat(outputPath);
  assert.equal(result.summary, undefined);
  assert.deepEqual(result.outcome_counts, { accepted: 1 });
  assert.equal(result.usable_events_under_current_validation, 1);
  assert.equal(result.safety.network_requests, 0);
  assert.equal(information.mode & 0o777, 0o600);
  assert.ok(!reportText.includes(runId));
  assert.ok(!reportText.includes(url));
  assert.ok(!reportText.includes(report));
  assert.ok(!reportText.includes("private-response-id"));
  const database = openSqliteDatabase(databasePath);
  assert.equal(
    database.prepare("select count(*) count from search_runs").get().count,
    1,
  );
  database.close();
});

test("current bounded repair can normalize an unfamiliar captured candidate", async () => {
  const directory = await temporaryDirectory();
  const databasePath = join(directory, "history.sqlite");
  const extractionPath = join(directory, "extraction.json");
  const repairPath = join(directory, "repair.json");
  const manifestPath = join(directory, "manifest.json");
  const outputPath = join(directory, "report.json");
  seedRun(databasePath);
  await writeCapture(extractionPath, [{ ...candidate(), unfamiliar: null }]);
  await writeCapture(repairPath, { candidates: [candidate()] });
  await writeManifest(manifestPath, [extractionPath, repairPath]);
  await runCaptureReplayCli(
    ["run", "--manifest", manifestPath, "--output", outputPath],
    {
      DATABASE_BACKEND: "sqlite",
      SQLITE_DATABASE_PATH: databasePath,
    },
  );
  const replay = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(replay.cases[0].outcome, "accepted");
  assert.equal(replay.cases[0].captures_consumed, 2);
  assert.equal(replay.cases[0].usable_event_count, 1);
  assert.equal(
    replay.cases[0].provider_diagnostics[1].repair_validation,
    "accepted",
  );
});

test("offline replay reports safe JSON formatting diagnostics without accepting fenced content", async () => {
  const directory = await temporaryDirectory();
  const databasePath = join(directory, "history.sqlite");
  const capturePath = join(directory, "fenced.json");
  const manifestPath = join(directory, "manifest.json");
  const outputPath = join(directory, "report.json");
  seedRun(databasePath);
  await writeFile(
    capturePath,
    JSON.stringify({
      content:
        "```json\n" +
        JSON.stringify({ private: "PRIVATE-SECRET-CONTENT" }) +
        "\n```",
    }),
  );
  await writeManifest(manifestPath, [capturePath]);
  const result = await runCaptureReplayCli(
    ["run", "--manifest", manifestPath, "--output", outputPath],
    { DATABASE_BACKEND: "sqlite", SQLITE_DATABASE_PATH: databasePath },
  );
  const reportText = await readFile(outputPath, "utf8");
  const replay = JSON.parse(reportText);
  assert.equal(replay.cases[0].adapter_error_code, "invalid_extraction_json");
  assert.equal(replay.cases[0].captures_consumed, 1);
  assert.equal(replay.cases[0].usable_event_count, 0);
  const diagnostic = replay.cases[0].provider_diagnostics[0].structured_output;
  assert.equal(diagnostic.parse_status, "invalid");
  assert.equal(diagnostic.format, "single_code_fence");
  assert.equal(diagnostic.fence_json_valid, true);
  assert.equal(result.safety.network_requests, 0);
  assert.ok(!reportText.includes("PRIVATE-SECRET-CONTENT"));
  assert.ok(!reportText.includes(url));
  assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  const database = openSqliteDatabase(databasePath);
  assert.equal(
    database.prepare("select count(*) count from events").get().count,
    0,
  );
  assert.equal(
    database.prepare("select count(*) count from search_runs").get().count,
    1,
  );
  database.close();
});

test("missing repair capture fails safely as sequence exhaustion", async () => {
  const directory = await temporaryDirectory();
  const databasePath = join(directory, "history.sqlite");
  const capturePath = join(directory, "extraction.json");
  const manifestPath = join(directory, "manifest.json");
  const outputPath = join(directory, "report.json");
  seedRun(databasePath);
  await writeCapture(capturePath, [
    { ...candidate(), unfamiliar: "PRIVATE-SECRET-CONTENT" },
  ]);
  await writeManifest(manifestPath, [capturePath], "unknown");
  await runCaptureReplayCli(
    ["run", "--manifest", manifestPath, "--output", outputPath],
    {
      DATABASE_BACKEND: "sqlite",
      SQLITE_DATABASE_PATH: databasePath,
    },
  );
  const reportText = await readFile(outputPath, "utf8");
  const replay = JSON.parse(reportText);
  assert.equal(replay.cases[0].outcome, "capture_sequence_exhausted");
  assert.equal(
    replay.cases[0].adapter_error_code,
    "capture_sequence_exhausted",
  );
  assert.ok(!reportText.includes("PRIVATE-SECRET-CONTENT"));
});

test("malformed private captures are rejected without producing a report", async () => {
  const directory = await temporaryDirectory();
  const databasePath = join(directory, "history.sqlite");
  const capturePath = join(directory, "capture.json");
  const manifestPath = join(directory, "manifest.json");
  const outputPath = join(directory, "report.json");
  seedRun(databasePath);
  await writeFile(capturePath, JSON.stringify({ content: 42 }));
  await writeManifest(manifestPath, [capturePath]);
  await assert.rejects(
    runCaptureReplayCli(
      ["run", "--manifest", manifestPath, "--output", outputPath],
      {
        DATABASE_BACKEND: "sqlite",
        SQLITE_DATABASE_PATH: databasePath,
      },
    ),
  );
  await assert.rejects(readFile(outputPath, "utf8"));
});
