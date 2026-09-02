import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenRouterSearchProvider,
  API_LIMITS,
} from "../../lib/ingestion/openrouter-provider.ts";
import { runIngestion } from "../../lib/ingestion/run.ts";
import { selectSources } from "../../lib/ingestion/sources.ts";
import {
  candidate,
  memoryRepository,
  report,
  options,
  url,
} from "./helpers.mjs";

const signal = new AbortController().signal;
const key = "offline-test-not-a-key";

function response(text, searches = 0) {
  return {
    id: "gen-offline-test",
    model: "openai/gpt-4.1",
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: text,
          annotations: searches
            ? [
                {
                  type: "url_citation",
                  url_citation: {
                    url,
                    title: "Founder Test",
                    content: "untrusted snippet",
                  },
                },
              ]
            : [],
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      cost: 0.001,
      server_tool_use: { web_search_requests: searches },
    },
  };
}

function providerWithResponses(responses, model = "openai/gpt-4.1") {
  const requests = [];
  const provider = new OpenRouterSearchProvider(
    key,
    model,
    async (input, init) => {
      requests.push({
        input: String(input),
        init,
        body: JSON.parse(init.body),
      });
      const next = responses.shift();
      assert.ok(next, "unexpected extra API call");
      return new Response(JSON.stringify(next.body ?? next), {
        status: next.httpStatus ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  return { requests, provider };
}

test("OpenRouter sends bounded agentic search and tool-free structured extraction offline", async () => {
  const { provider, requests } = providerWithResponses(
    [
      response(report, 2),
      response(JSON.stringify({ candidates: [candidate()] })),
    ],
    "google/test-model",
  );
  const research = await provider.research(options, signal);
  assert.deepEqual(research.urls, [url]);
  assert.equal(research.metadata.usage.total_tokens, 30);
  assert.equal(research.metadata.usage.cost, 0.001);
  assert.equal(research.metadata.search_tool_calls, 2);
  assert.equal(research.metadata.requested_model, "google/test-model");
  assert.equal(research.metadata.model, "openai/gpt-4.1");
  const extracted = await provider.extract(
    research,
    selectSources(research.urls, 3),
    signal,
  );
  assert.equal(extracted.candidates.length, 1);
  for (const request of requests) {
    assert.equal(
      request.input,
      "https://openrouter.ai/api/v1/chat/completions",
    );
    assert.equal(request.init.redirect, "error");
    assert.equal(request.init.headers.Authorization, "Bearer " + key);
    assert.equal(request.body.model, "google/test-model");
    assert.deepEqual(request.body.provider, {
      require_parameters: true,
      allow_fallbacks: false,
    });
    assert.equal(request.body.stream, false);
    assert.ok(!JSON.stringify(request.body).includes(key));
  }
  const search = requests[0].body;
  assert.equal(search.max_tool_calls, API_LIMITS.searchToolCalls);
  assert.equal(search.tools[0].type, "openrouter:web_search");
  assert.equal(search.tools[0].parameters.engine, "exa");
  assert.equal(search.tools[0].parameters.max_uses, 3);
  assert.equal(search.tools[0].parameters.max_total_results, 15);
  assert.equal(search.tools[0].parameters.max_characters, 2000);
  assert.ok(search.tools[0].parameters.allowed_domains.includes("luma.com"));
  assert.equal(search.tool_choice, "required");
  assert.equal(search.max_tokens, API_LIMITS.researchOutputTokens);
  const extraction = requests[1].body;
  assert.equal(extraction.response_format.type, "json_schema");
  assert.equal(extraction.response_format.json_schema.strict, true);
  assert.equal(
    extraction.response_format.json_schema.schema.additionalProperties,
    false,
  );
  assert.deepEqual(extraction.tools, []);
  assert.equal(extraction.tool_choice, "none");
  assert.equal(extraction.max_tool_calls, undefined);
  assert.equal(extraction.max_tokens, API_LIMITS.extractionOutputTokens);
  assert.ok(!JSON.stringify(research.metadata).includes("untrusted snippet"));
  await assert.rejects(provider.research(options, signal), /api_call_limit/);
  assert.equal(requests.length, 2);
});

test("credit, rate, authentication and provider errors stop without retries or raw error leaks", async () => {
  for (const [status, code] of [
    [402, "provider_quota_or_rate_limit"],
    [429, "provider_quota_or_rate_limit"],
    [401, "provider_authentication_failed"],
    [403, "provider_authentication_failed"],
    [503, "provider_request_failed"],
  ]) {
    for (const httpStatus of [status, 200]) {
      const { provider, requests } = providerWithResponses([
        { httpStatus, body: { error: { code: status, message: key } } },
      ]);
      await assert.rejects(provider.research(options, signal), (error) => {
        assert.equal(error.code, code);
        assert.ok(!error.message.includes(key));
        return true;
      });
      assert.equal(requests.length, 1);
    }
  }
});

test("incomplete, refused, malformed, missing-search and over-budget responses fail closed", async () => {
  const incomplete = response("partial", 1);
  incomplete.choices[0].finish_reason = "length";
  const refused = response("", 1);
  refused.choices[0].message.refusal = "refused";
  const missingUsage = response(report, 1);
  delete missingUsage.usage;
  const tools = response(report, 1);
  tools.choices[0].message.tool_calls = [{ id: "unexecuted" }];
  for (const [value, expected] of [
    [incomplete, /provider_incomplete/],
    [refused, /provider_refused/],
    [response(report), /search_not_performed/],
    [missingUsage, /search_not_performed/],
    [response(report, 4), /search_tool_limit_exceeded/],
    [tools, /provider_incomplete/],
    [{ choices: [] }, /invalid_provider_response/],
  ]) {
    await assert.rejects(
      providerWithResponses([value]).provider.research(options, signal),
      expected,
    );
  }
});

test("oversized bodies/reports, invalid JSON, extra candidates and extraction searches are rejected", async () => {
  await assert.rejects(
    providerWithResponses([
      response("x".repeat(API_LIMITS.reportCharacters + 1), 1),
    ]).provider.research(options, signal),
    /invalid_research_report/,
  );
  await assert.rejects(
    providerWithResponses([
      response("x".repeat(API_LIMITS.responseBytes + 1), 1),
    ]).provider.research(options, signal),
    /provider_response_too_large/,
  );
  for (const [text, expected] of [
    ["not json", /invalid_extraction_json/],
    ['{"candidates":{}}', /invalid_extraction_shape/],
    [
      JSON.stringify({ candidates: Array(2).fill(candidate()) }),
      /invalid_extraction_shape/,
    ],
  ]) {
    await assert.rejects(
      providerWithResponses([response(text)]).provider.extract(
        { report, urls: [url], metadata: {} },
        selectSources([url], 3),
        signal,
      ),
      expected,
    );
  }
  await assert.rejects(
    providerWithResponses([response('{"candidates":[]}', 1)]).provider.extract(
      { report, urls: [url], metadata: {} },
      selectSources([url], 3),
      signal,
    ),
    /unexpected_extraction_search/,
  );
});

test("cancellation and network failures never retry or expose transport details", async () => {
  const controller = new AbortController();
  controller.abort();
  const { provider, requests } = providerWithResponses([]);
  await assert.rejects(
    provider.research(options, controller.signal),
    /run_cancelled/,
  );
  assert.equal(requests.length, 0);
  const active = new AbortController();
  const cancelled = new OpenRouterSearchProvider(
    key,
    "openai/gpt-4.1",
    async () => {
      active.abort();
      throw new Error(key);
    },
  );
  await assert.rejects(
    cancelled.research(options, active.signal),
    /run_cancelled/,
  );
  const failed = new OpenRouterSearchProvider(
    key,
    "openai/gpt-4.1",
    async () => {
      throw new Error(key);
    },
  );
  await assert.rejects(
    failed.research(options, signal),
    /^IngestionError: provider_request_failed$/,
  );
});

test("OpenRouter results pass through draft validation and repeat-run deduplication", async () => {
  const repository = memoryRepository();
  for (let run = 0; run < 2; run++) {
    const { provider } = providerWithResponses([
      response(report, 1),
      response(JSON.stringify({ candidates: [candidate()] })),
    ]);
    const summary = await runIngestion(options, {
      provider,
      repository,
      signal,
    });
    assert.equal(summary.status, "succeeded");
    assert.equal(summary.events_written, 1);
    assert.equal(summary.sources_created, run === 0 ? 1 : 0);
    assert.equal(repository.runs[run].metadata.research.provider, "openrouter");
  }
  assert.equal(repository.events.size, 1);
  assert.equal(repository.sources.size, 1);
  assert.equal(
    repository.sources.get(url).raw_payload.evidence_kind,
    "model_web_search_report",
  );
  assert.ok(!JSON.stringify(repository.runs).includes(key));
});

test("only annotated URLs can become drafts; an empty search skips extraction", async () => {
  const search = response(report + " https://luma.com/invented", 1);
  search.choices[0].message.annotations = [];
  const { provider, requests } = providerWithResponses([search]);
  const repository = memoryRepository();
  const summary = await runIngestion(options, { provider, repository, signal });
  assert.equal(summary.status, "succeeded");
  assert.equal(summary.events_written, 0);
  assert.equal(requests.length, 1);
});

test("request timeout is bounded and invalid HTTP JSON fails safely", async (t) => {
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 120000);
    return AbortSignal.abort();
  });
  const timed = new OpenRouterSearchProvider(
    key,
    "openai/gpt-4.1",
    async (_url, init) => {
      assert.equal(init.signal.aborted, true);
      throw new Error(key);
    },
  );
  await assert.rejects(
    timed.research(options, signal),
    /provider_request_timeout/,
  );
  t.mock.restoreAll();
  const badJson = new OpenRouterSearchProvider(
    key,
    "openai/gpt-4.1",
    async () => new Response("not JSON " + key),
  );
  await assert.rejects(
    badJson.research(options, signal),
    /^IngestionError: invalid_provider_response$/,
  );
});

test("missing extraction usage stays unknown rather than inventing zero cost", async () => {
  const value = response(JSON.stringify({ candidates: [] }));
  value.usage = null;
  value.choices[0].message.tool_calls = null;
  value.choices[0].message.annotations = null;
  const { provider } = providerWithResponses([value]);
  const extracted = await provider.extract(
    { report, urls: [url], metadata: {} },
    selectSources([url], 3),
    signal,
  );
  assert.equal(extracted.metadata.usage, null);
  assert.equal(extracted.metadata.search_tool_calls, null);
});
