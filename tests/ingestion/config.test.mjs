import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  readModelConfig,
  readOpenRouterKey,
} from "../../lib/ingestion/local-config.ts";
import { parseIngestionArgs } from "../../lib/ingestion/cli.ts";

async function directory(t) {
  await mkdir("codex-tmp", { recursive: true });
  const path = await mkdtemp(resolve("codex-tmp/openrouter-config-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

function runCli(cwd, args, env = {}) {
  const entry = pathToFileURL(resolve("scripts/ingest.ts")).href;
  return spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `globalThis.fetch = async () => { throw new Error('unexpected network request'); }; process.argv = ['node', 'ingest', ...${JSON.stringify(args)}]; await import(${JSON.stringify(entry)});`,
    ],
    {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
      timeout: 10000,
    },
  );
}

test("checked-in model default and CLI override work without opening a key file", async (t) => {
  assert.deepEqual(await readModelConfig(), { model: "openai/gpt-5.6-luna" });
  const dir = await directory(t);
  await mkdir(dir + "/config");
  await writeFile(
    dir + "/config/ingestion.json",
    '{"model":"anthropic/test-model"}',
  );
  // A directory would fail key loading: even paid opt-in must not make a plan read it.
  await mkdir(dir + "/OPENROUTER.key");
  const plan = runCli(dir, ["--limit", "3"], {
    FOUNDER_RADAR_ALLOW_PAID_API: "1",
    OPENAI_MODEL: "ignored",
  });
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).model, "anthropic/test-model");
  assert.equal(JSON.parse(plan.stdout).paid_calls, false);
  assert.equal(JSON.parse(plan.stdout).writes, false);
  const override = runCli(dir, ["--model", "google/test-model"]);
  assert.equal(override.status, 0, override.stderr);
  assert.equal(JSON.parse(override.stdout).model, "google/test-model");
  await writeFile(dir + "/other.json", '{"model":"meta-llama/test-model"}');
  const custom = runCli(dir, ["--config", "other.json"]);
  assert.equal(custom.status, 0, custom.stderr);
  assert.equal(JSON.parse(custom.stdout).model, "meta-llama/test-model");
});

test("help needs no config or key; paid approval and database validation precede key access", async (t) => {
  const dir = await directory(t);
  const help = runCli(dir, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /OPENROUTER.key/);
  await mkdir(dir + "/config");
  await writeFile(dir + "/config/ingestion.json", '{"model":"openai/gpt-4.1"}');
  const blocked = runCli(dir, ["--live"]);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /paid_api_not_enabled/);
  const missingDb = runCli(dir, ["--live"], {
    FOUNDER_RADAR_ALLOW_PAID_API: "1",
  });
  assert.match(missingDb.stderr, /missing_ingestion_environment/);
  const missingKey = runCli(dir, ["--live"], {
    FOUNDER_RADAR_ALLOW_PAID_API: "1",
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "fake-test-only",
  });
  assert.equal(missingKey.status, 1);
  assert.match(missingKey.stderr, /openrouter_key_file_unavailable/);
  assert.doesNotMatch(missingKey.stderr, /fake-test-only|unexpected network/);
});

test("config is strict, bounded and explicit; malformed config and ambiguous flags fail safely", async (t) => {
  const dir = await directory(t);
  const path = dir + "/config.json";
  for (const text of [
    "not-json",
    '{"model":""}',
    '{"model":"gpt-4.1"}',
    '{"model":"openai/gpt-4.1","apiKey":"secret"}',
    '{"model":"openrouter/auto"}',
    '{"model":"openai/gpt-4.1:online"}',
    '{"model":"openai/gpt-4.1:online:free"}',
    '{"model":"https://evil.test/model"}',
    " ".repeat(16385),
  ]) {
    await writeFile(path, text);
    await assert.rejects(
      readModelConfig(path),
      /^IngestionError: invalid_ingestion_config$/,
    );
  }
  await writeFile(path, '{"model":"openai/gpt-4.1"}');
  await assert.rejects(
    readModelConfig(path, "bad-model"),
    /invalid_ingestion_config/,
  );
  await assert.rejects(
    readModelConfig(dir + "/missing"),
    /invalid_ingestion_config/,
  );
  for (const args of [
    ["--model", ""],
    ["--config", ""],
    ["--model"],
    ["--config"],
    ["--model", "a/b", "--model", "c/d"],
    ["--live", "--live"],
  ])
    assert.throws(() => parseIngestionArgs(args), /invalid_cli_arguments/);
  assert.equal(
    parseIngestionArgs(["--model=google/test-model"]).model,
    "google/test-model",
  );
});

test("key file accepts one trimmed token, rejects unsafe files, and never echoes contents", async (t) => {
  const dir = await directory(t);
  const path = dir + "/OPENROUTER.key";
  await writeFile(path, "  sk-or-v1-offline-test-only\n", { mode: 0o600 });
  assert.equal(await readOpenRouterKey(path), "sk-or-v1-offline-test-only");
  for (const text of [
    "",
    " \n",
    '"sk-or-v1-secret"',
    "Bearer secret",
    "first\nsecret",
    '{"key":"secret"}',
    "secret=".repeat(1000),
  ]) {
    await writeFile(path, text);
    await assert.rejects(readOpenRouterKey(path), (error) => {
      assert.match(
        error.code,
        /^(invalid_openrouter_key_file|openrouter_key_file_unavailable)$/,
      );
      assert.ok(!error.message.includes("secret"));
      return true;
    });
  }
  await assert.rejects(
    readOpenRouterKey(dir),
    /openrouter_key_file_unavailable/,
  );
  await assert.rejects(
    readOpenRouterKey(dir + "/missing"),
    /openrouter_key_file_unavailable/,
  );
  await symlink(path, dir + "/link.key");
  await assert.rejects(
    readOpenRouterKey(dir + "/link.key"),
    /openrouter_key_file_unavailable/,
  );
  const ignored = execFileSync(
    "git",
    ["check-ignore", "--no-index", "OPENROUTER.key"],
    { encoding: "utf8" },
  );
  assert.equal(ignored.trim(), "OPENROUTER.key");
});
