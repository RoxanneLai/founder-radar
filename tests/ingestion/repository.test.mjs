import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { SupabaseIngestionRepository } from "../../lib/ingestion/repository.ts";
import { options, url } from "./helpers.mjs";

test("Supabase SDK maps run lifecycle and atomic RPC, including source-only observations", async () => {
  const calls = [];
  const client = createClient(
    "http://127.0.0.1:54321",
    "offline-test-not-a-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const requestUrl = String(input);
          calls.push({
            url: requestUrl,
            method: init.method,
            body: init.body ? JSON.parse(init.body) : null,
          });
          const value = requestUrl.includes("/rpc/")
            ? {
                source_id: "source-test",
                event_id: null,
                source_created: true,
                event_written: false,
              }
            : { id: "run-test" };
          return new Response(JSON.stringify(value), {
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  const repo = new SupabaseIngestionRepository(client, "openai/gpt-4.1");
  const id = await repo.start(options);
  await repo.checkpoint(id, { phase: "research" });
  const saved = await repo.save(
    id,
    { source_name: "luma.com", source_url: url, external_id: null },
    null,
    "2026-09-01T12:00:00Z",
  );
  assert.equal(saved.event_id, null);
  await repo.finish(
    {
      run_id: id,
      status: "succeeded",
      sources_discovered: 1,
      sources_created: 1,
      sources_updated: 0,
      errors: [],
    },
    {},
  );
  assert.match(calls[0].url, /last_attempt_at/);
  assert.equal(calls[1].body.provider, "openrouter-web-search");
  assert.equal(calls[1].body.search_parameters.model, "openai/gpt-4.1");
  assert.match(calls[3].url, /\/rest\/v1\/rpc\/ingest_event_source/);
  assert.equal(calls[3].body.p_event, null);
  assert.equal(calls[3].body.p_run_id, id);
  assert.equal(calls[4].body.status, "succeeded");
  assert.match(calls[4].url, /status=eq.running/);
});

test("missing migration returns a safe actionable error, not raw PostgREST text", async () => {
  const client = createClient("http://127.0.0.1:54321", "offline-test", {
    auth: { persistSession: false },
    global: {
      fetch: async () =>
        new Response(
          JSON.stringify({ code: "PGRST202", message: "sensitive details" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        ),
    },
  });
  await assert.rejects(
    new SupabaseIngestionRepository(client).save(
      "run",
      {},
      null,
      "2026-09-01T00:00:00Z",
    ),
    /ingestion_migration_required/,
  );
});

test("schema preflight fails before creating a run when migrations or access are missing", async () => {
  const calls = [];
  const client = createClient("http://127.0.0.1:54321", "offline-test", {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        calls.push(init.method);
        return new Response(
          JSON.stringify({ code: "42703", message: "missing column" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  });
  await assert.rejects(
    new SupabaseIngestionRepository(client).start(options),
    /ingestion_preflight_failed/,
  );
  assert.deepEqual(calls, ["GET"]);
});
