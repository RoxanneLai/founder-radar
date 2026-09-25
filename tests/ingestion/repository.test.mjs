import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { SupabaseIngestionRepository } from "../../lib/ingestion/repository.ts";
import {
  executeInspection,
  inspectionStatement,
  runInspectionCli,
} from "../../lib/ingestion/inspection.ts";
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
          const value = requestUrl.includes(
            "last_attempt_error=eq.source_page_cancelled",
          )
            ? [{ source_url: url }]
            : requestUrl.includes("/rpc/")
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
  const repo = new SupabaseIngestionRepository(
    client,
    "openai/gpt-4.1",
    "high",
    "qwen/qwen3.5-27b",
    "none",
  );
  const id = await repo.start(options);
  const excluded = await repo.listRecentCancelledSourceUrls(
    "2026-06-03T12:00:00.000Z",
    50,
  );
  assert.deepEqual(excluded, [url]);
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
  assert.equal(calls[1].body.search_parameters.effort, "high");
  assert.equal(
    calls[1].body.search_parameters.repair_model,
    "qwen/qwen3.5-27b",
  );
  assert.equal(calls[1].body.search_parameters.repair_effort, "none");
  assert.match(calls[2].url, /event_id=is.null/);
  assert.match(calls[2].url, /last_attempt_error=eq.source_page_cancelled/);
  assert.match(calls[2].url, /limit=50/);
  assert.match(calls[4].url, /\/rest\/v1\/rpc\/ingest_event_source/);
  assert.equal(calls[4].body.p_event, null);
  assert.equal(calls[4].body.p_run_id, id);
  assert.equal(calls[5].body.status, "succeeded");
  assert.match(calls[5].url, /status=eq.running/);

  const runId = "10000000-0000-4000-8000-000000000001";
  const sourceId = "20000000-0000-4000-8000-000000000001";
  const statement = inspectionStatement(runId);
  assert.match(statement, /provider_diagnostics|last_attempt_error/);
  assert.doesNotMatch(statement, /content_text|raw_payload/);
  let dockerCalls = 0;
  const rawInspection = await executeInspection(runId, async (args, input) => {
    dockerCalls += 1;
    if (dockerCalls === 1) return "unix:///var/run/docker.sock";
    assert.ok(args.includes("supabase_db_founder-radar"));
    assert.match(input, /begin read only/);
    assert.doesNotMatch(input, /\b(insert|update|delete)\b/i);
    return JSON.stringify({
      run: {
        id: runId,
        provider: "openrouter-web-search",
        status: "partial",
        started_at: "2026-09-24T20:58:22Z",
        completed_at: "2026-09-24T20:59:09Z",
        search_parameters: { limit: 3 },
        sources_discovered: 1,
        sources_created: 1,
        sources_updated: 0,
        error_message: "invalid_repair_output",
      },
      provider_diagnostics: [
        {
          phase: "repair",
          repair_scalar_mismatch_count: 1,
          repair_scalar_mismatch_paths: ["candidates[0].venue_name.value"],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            reasoning_tokens: 2,
            total_tokens: 30,
            cost: 0.002,
          },
        },
      ],
      sources: [
        {
          id: sourceId,
          source_name: "luma.com",
          source_url: url,
          event_id: null,
          first_seen_at: "2026-09-24T20:58:46Z",
          last_seen_at: "2026-09-24T20:58:46Z",
          last_attempt_at: "2026-09-24T20:59:09Z",
          last_attempt_error: "invalid_repair_output",
        },
      ],
    });
  });
  const inspection = await runInspectionCli(
    ["--run", runId],
    async () => rawInspection,
  );
  assert.equal(inspection.mode, "read_only_ingestion_run");
  assert.equal(inspection.usage.provider_reported_cost_usd, 0.002);
  assert.equal(inspection.unlinked_source_count, 1);
  assert.equal(inspection.paid_requests, 0);
  assert.equal(inspection.database_writes, 0);
  const noConnection = async () => assert.fail("must not connect");
  assert.match((await runInspectionCli([], noConnection)).help, /read-only/);
  for (const args of [
    ["--run"],
    ["--run", "not-a-uuid"],
    ["--run", runId, "--run", runId],
  ])
    await assert.rejects(runInspectionCli(args, noConnection));
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
