import assert from "node:assert/strict";
import test from "node:test";
import OpenAI from "openai";
import {
  OpenAISearchProvider,
  API_LIMITS,
} from "../../lib/ingestion/openai-provider.ts";
import { selectSources } from "../../lib/ingestion/sources.ts";
import { candidate, report, options, url } from "./helpers.mjs";

const signal = new AbortController().signal;

function response(text, extra = {}) {
  return {
    id: "resp_offline_test",
    object: "response",
    created_at: 0,
    status: "completed",
    error: null,
    incomplete_details: null,
    model: "test-model",
    output: [
      {
        type: "message",
        id: "msg_test",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    ...extra,
  };
}

function researchResponse() {
  const value = response(report);
  value.output.unshift({
    type: "web_search_call",
    id: "search_test",
    status: "completed",
    action: {
      type: "search",
      query: "founder events",
      sources: [{ type: "url", url }],
    },
  });
  value.output[1].content[0].annotations = [
    {
      type: "url_citation",
      url,
      title: "Founder Test",
      start_index: 0,
      end_index: 12,
    },
  ];
  return value;
}

function providerWithResponses(responses) {
  const requests = [];
  const client = new OpenAI({
    apiKey: "offline-test-not-a-key",
    maxRetries: 0,
    fetch: async (input, init) => {
      requests.push({ input: String(input), body: JSON.parse(init.body) });
      const next = responses.shift();
      assert.ok(next, "unexpected extra API call");
      return new Response(JSON.stringify(next.body ?? next), {
        status: next.httpStatus ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return {
    requests,
    provider: new OpenAISearchProvider(client.responses, "test-model"),
  };
}

test("real SDK sends bounded search then structured extraction without any external network", async () => {
  const { provider, requests } = providerWithResponses([
    researchResponse(),
    response(JSON.stringify({ candidates: [candidate()] })),
  ]);
  const research = await provider.research(options, signal);
  assert.deepEqual(research.urls, [url]);
  assert.equal(research.metadata.usage.total_tokens, 30);
  const extracted = await provider.extract(
    research,
    selectSources(research.urls, 3),
    signal,
  );
  assert.equal(extracted.candidates.length, 1);
  assert.equal(requests[0].body.max_tool_calls, API_LIMITS.searchToolCalls);
  assert.equal(requests[0].body.tools[0].type, "web_search");
  assert.equal(requests[0].body.tools[0].external_web_access, true);
  assert.equal(requests[0].body.tool_choice, "required");
  assert.deepEqual(requests[0].body.include, [
    "web_search_call.action.sources",
  ]);
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[1].body.text.format.type, "json_schema");
  assert.equal(requests[1].body.text.format.strict, true);
  assert.deepEqual(requests[1].body.tools, []);
  assert.equal(requests[1].body.max_tool_calls, undefined);
  await assert.rejects(provider.research(options, signal), /api_call_limit/);
  assert.equal(requests.length, 2);
});

test("quota errors stop after one request and never expose provider error text", async () => {
  const { provider, requests } = providerWithResponses([
    {
      httpStatus: 429,
      body: {
        error: {
          message: "secret-do-not-log",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      },
    },
  ]);
  await assert.rejects(provider.research(options, signal), (error) => {
    assert.equal(error.code, "provider_quota_or_rate_limit");
    assert.ok(!error.message.includes("secret"));
    return true;
  });
  assert.equal(requests.length, 1);
});

test("incomplete responses, refusals, and ungrounded research fail closed", async () => {
  const incomplete = response("partial", {
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
  });
  const refused = response("");
  refused.output[0].content = [{ type: "refusal", refusal: "no" }];
  for (const [value, expected] of [
    [incomplete, /provider_incomplete/],
    [refused, /provider_refused/],
    [response(report), /search_not_performed/],
  ]) {
    const { provider } = providerWithResponses([value]);
    await assert.rejects(provider.research(options, signal), expected);
  }
});

test("oversized research, invalid JSON and excess candidates are rejected", async () => {
  const tooBig = researchResponse();
  tooBig.output[1].content[0].text = "x".repeat(
    API_LIMITS.reportCharacters + 1,
  );
  await assert.rejects(
    providerWithResponses([tooBig]).provider.research(options, signal),
    /invalid_research_report/,
  );
  for (const [text, expected] of [
    ["not json", /invalid_extraction_json/],
    ['{"candidates":{}}', /invalid_extraction_shape/],
    [
      JSON.stringify({ candidates: Array(11).fill(candidate()) }),
      /invalid_extraction_shape/,
    ],
  ]) {
    const { provider } = providerWithResponses([response(text)]);
    await assert.rejects(
      provider.extract(
        { report, urls: [url], metadata: {} },
        selectSources([url], 3),
        signal,
      ),
      expected,
    );
  }
});

test("already-cancelled provider calls never reach the SDK", async () => {
  const controller = new AbortController();
  controller.abort();
  const { provider, requests } = providerWithResponses([]);
  await assert.rejects(
    provider.research(options, controller.signal),
    /run_cancelled/,
  );
  assert.equal(requests.length, 0);
});
