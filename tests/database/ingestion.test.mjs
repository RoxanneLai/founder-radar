import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";

// Always create an isolated database, never reset or alter the user's postgres DB.
const container = "supabase_db_founder-radar";
const database =
  "fr_ingestion_test_" + randomUUID().replaceAll("-", "").slice(0, 16);
let created = false;

function docker(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => child.kill(), 30000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new Error(errors || "Docker database command failed"));
      else resolve(output);
    });
    child.stdin.end(input);
  });
}

function sql(input) {
  return docker(
    [
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      database,
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    input,
  );
}

before(async () => {
  await docker(["createdb", "-U", "postgres", database]);
  created = true;
  await sql(
    "create schema extensions; grant usage on schema extensions to public;",
  );
  const migrations = (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations)
    await sql(await readFile("supabase/migrations/" + name, "utf8"));
  await sql(await readFile("supabase/seed.sql", "utf8"));
});

after(async () => {
  assert.match(database, /^fr_ingestion_test_[a-f0-9]{16}$/);
  if (created) await docker(["dropdb", "-U", "postgres", database]);
});

test("all pgTAP contracts pass against migrations and seeds in a disposable database", async (t) => {
  const tests = (await readdir("supabase/tests/database"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of tests) {
    const output = await sql(
      await readFile("supabase/tests/database/" + name, "utf8"),
    );
    assert.doesNotMatch(
      output,
      /not ok|Looks like you failed|Bad plan/i,
      name + "\n" + output,
    );
    assert.match(output, /\b1\.\.\d+/, name + " did not run pgTAP");
    t.diagnostic(
      name + ": " + output.match(/\b1\.\.(\d+)/)[1] + " assertions passed",
    );
  }
});

test("concurrent repeat ingestion writes one source and one linked draft", async () => {
  const runId = randomUUID();
  await sql(
    "insert into public.search_runs(id,agent_name,provider) values ('" +
      runId +
      "','concurrency-test','test');",
  );
  const source = {
    source_name: "concurrency-test",
    source_url: "https://example.invalid/concurrent",
    content_text: "test evidence",
  };
  const event = {
    title: "Concurrency test",
    starts_at: "2026-09-05T22:00:00Z",
    time_zone: "America/New_York",
    city: "New York",
    region: "NY",
    country_code: "US",
    event_format: "in-person",
  };
  const statement =
    "select * from public.ingest_event_source('" +
    runId +
    "', '" +
    JSON.stringify(source) +
    "'::jsonb, '" +
    JSON.stringify(event) +
    "'::jsonb);";
  await Promise.all([sql(statement), sql(statement)]);
  const counts = await sql(
    "select count(*), count(distinct event_id) from public.event_sources where source_name='concurrency-test';",
  );
  assert.equal(counts.trim(), "1|1");
  assert.equal(
    (
      await sql(
        "select count(*) from public.events where title='Concurrency test';",
      )
    ).trim(),
    "1",
  );
});
