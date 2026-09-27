import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  executeRecovery,
  executeSqliteRecovery,
  parseRecoveryOptions,
  recoveryStatement,
  runRecoveryCli,
} from "../../lib/ingestion/recovery.ts";
import { openSqliteDatabase } from "../../lib/storage/sqlite.ts";

const runId = "90000000-0000-4000-8000-000000000001";
const secondRunId = "90000000-0000-4000-8000-000000000002";
const revision = "2026-09-26T18:57:26.886Z";
const recoveredAt = new Date("2026-09-26T20:00:00.000Z");

async function temporaryDatabase() {
  await mkdir("codex-tmp", { recursive: true });
  const directory = await mkdtemp("codex-tmp/recovery-test-");
  return join(directory, "founder-radar.sqlite");
}

function insertRun(path, id, status = "running", updatedAt = revision) {
  const database = openSqliteDatabase(path);
  database
    .prepare(
      `insert into search_runs (
        id, agent_name, provider, search_parameters, status, started_at,
        completed_at, metadata, created_at, updated_at
      ) values (?, 'synthetic-recovery', 'test', '{}', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      status,
      "2026-09-26T18:30:00.000Z",
      status === "running" ? null : "2026-09-26T18:45:00.000Z",
      JSON.stringify({ checkpoint: "preserve-me" }),
      "2026-09-26T18:30:00.000Z",
      updatedAt,
    );
  database.close();
}

test("recovery help and malformed approvals fail before database access", async () => {
  const noConnection = async () => assert.fail("must not connect");
  assert.match(
    (await runRecoveryCli([], noConnection)).help,
    /original process/,
  );
  for (const args of [
    ["preview"],
    ["preview", "--run", "not-a-uuid"],
    ["cancel", "--run", runId],
    ["cancel", "--run", runId, "--revision", revision],
    ["cancel", "--run", runId, "--revision", "yesterday", "--approve"],
    ["list", "--approve"],
    ["list", "--unknown"],
  ])
    await assert.rejects(runRecoveryCli(args, noConnection));
});

test("SQLite recovery previews and atomically cancels only an unchanged running run", async () => {
  const path = await temporaryDatabase();
  insertRun(path, runId);
  insertRun(path, secondRunId, "succeeded", "2026-09-26T18:46:00.000Z");
  const env = {
    DATABASE_BACKEND: "sqlite",
    SQLITE_DATABASE_PATH: path,
  };
  const list = await runRecoveryCli(
    ["list"],
    (options) => executeRecovery(options, undefined, env),
    recoveredAt,
  );
  assert.equal(list.count, 1);
  assert.equal(list.running_runs[0].id, runId);
  assert.equal(list.database_writes, 0);
  const preview = await runRecoveryCli(
    ["preview", "--run", runId],
    (options) => executeRecovery(options, undefined, env),
    recoveredAt,
  );
  assert.equal(preview.revision, revision);
  assert.equal(preview.run.status, "running");
  await assert.rejects(
    runRecoveryCli(
      [
        "cancel",
        "--run",
        runId,
        "--revision",
        "2026-09-26T18:57:27.000Z",
        "--approve",
      ],
      (options) => executeRecovery(options, undefined, env),
      recoveredAt,
    ),
    /changed or is no longer running/,
  );
  const cancelled = await runRecoveryCli(
    ["cancel", "--run", runId, "--revision", preview.revision, "--approve"],
    (options) => executeRecovery(options, undefined, env),
    recoveredAt,
  );
  assert.equal(cancelled.run.status, "cancelled");
  assert.equal(cancelled.run.completed_at, recoveredAt.toISOString());
  assert.equal(cancelled.run.error_message, "run_cancelled");
  assert.equal(cancelled.database_writes, 1);
  const database = openSqliteDatabase(path);
  const stored = database
    .prepare(
      "select status, error_message, metadata from search_runs where id = ?",
    )
    .get(runId);
  database.close();
  assert.equal(stored.status, "cancelled");
  assert.equal(stored.error_message, "run_cancelled");
  assert.deepEqual(JSON.parse(stored.metadata), {
    checkpoint: "preserve-me",
    operator_recovery: {
      action: "cancelled_interrupted_run",
      recovered_at: recoveredAt.toISOString(),
    },
  });
  await assert.rejects(
    runRecoveryCli(
      ["cancel", "--run", runId, "--revision", preview.revision, "--approve"],
      (options) => executeRecovery(options, undefined, env),
      recoveredAt,
    ),
  );
});

test("recovery SQL and Supabase transport separate read-only inspection from one approved write", async () => {
  const preview = parseRecoveryOptions(["preview", "--run", runId]);
  assert.match(recoveryStatement(preview), /status = 'running'/);
  assert.doesNotMatch(
    recoveryStatement(preview),
    /update public\.search_runs/i,
  );
  const cancel = {
    ...parseRecoveryOptions([
      "cancel",
      "--run",
      runId,
      "--revision",
      revision,
      "--approve",
    ]),
    recoveredAt: recoveredAt.toISOString(),
  };
  assert.match(recoveryStatement(cancel), /update public\.search_runs/i);
  assert.match(recoveryStatement(cancel), /updated_at = .*::timestamptz/);
  let writes = 0;
  const result = await executeRecovery(cancel, async (args, input) => {
    if (args[0] === "context") return "unix:///local/docker.sock";
    writes++;
    assert.match(input, /^begin ;/);
    assert.match(input, /lock_timeout = '5s'/);
    return JSON.stringify({
      id: runId,
      provider: "test",
      status: "cancelled",
      started_at: "2026-09-26T18:30:00.000Z",
      completed_at: recoveredAt.toISOString(),
      sources_discovered: 0,
      sources_created: 0,
      sources_updated: 0,
      error_message: "run_cancelled",
      updated_at: recoveredAt.toISOString(),
    });
  });
  assert.equal(writes, 1);
  assert.equal(result.status, "cancelled");
  await assert.rejects(
    executeRecovery(preview, async () => "tcp://remote.example:2376"),
    /local Docker/,
  );
});

test("SQLite recovery executor never exposes private metadata", async () => {
  const path = await temporaryDatabase();
  insertRun(path, runId);
  const preview = executeSqliteRecovery(
    parseRecoveryOptions(["preview", "--run", runId]),
    path,
  );
  assert.ok(!JSON.stringify(preview).includes("preserve-me"));
  assert.ok(!("metadata" in preview));
});
