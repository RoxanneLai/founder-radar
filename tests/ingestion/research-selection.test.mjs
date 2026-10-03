import assert from "node:assert/strict";
import test from "node:test";
import { researchSelection } from "../../lib/ingestion/research-selection.ts";
import { OpenRouterSearchProvider } from "../../lib/ingestion/openrouter-provider.ts";
import { runIngestion } from "../../lib/ingestion/run.ts";
import { memoryRepository, options, url } from "./helpers.mjs";

const second = "https://luma.com/verification-lead";
const past = "https://luma.com/past-listing";
const signal = new AbortController().signal;
const listing = (source_url, disposition = "selected") => ({
  source_url,
  disposition,
});
const manifest = (listings, prose = "Research evidence") =>
  `${prose}\n\n\`\`\`rightroom-discovery-v1\n${JSON.stringify({ version: "rightroom-discovery-v1", listings })}\n\`\`\``;

function offlineProvider(content, annotatedUrls) {
  const requests = [];
  const provider = new OpenRouterSearchProvider(
    "offline-test-not-a-key",
    "openai/test-model",
    "low",
    async (endpoint, init) => {
      requests.push(JSON.parse(init.body));
      assert.equal(
        requests.length,
        1,
        "selection failure must not spend extraction or repair calls",
      );
      assert.equal(endpoint, "https://openrouter.ai/api/v1/chat/completions");
      return new Response(
        JSON.stringify({
          id: "gen-offline-selection",
          model: "openai/test-model",
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content,
                annotations: annotatedUrls.map((url) => ({
                  type: "url_citation",
                  url_citation: { url },
                })),
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            server_tool_use: { web_search_requests: 1 },
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  );
  return { provider, requests };
}

test("explicit discovery dispositions keep uncertain leads but never rejected/background citations", async () => {
  const text = manifest(
    [
      listing(past, "rejected"),
      listing(second, "needs_verification"),
      listing(url),
    ],
    `### 1. Legacy misleading background\n${past}\nPast result: ${past}; future leads: ${second} and ${url}.`,
  );
  assert.deepEqual(researchSelection(text), {
    urls: [second, url],
    format: "manifest_v1",
    rejectedCount: 1,
    verificationCount: 1,
  });
  const { provider, requests } = offlineProvider(text, [past, second, url]);
  const research = await provider.research(options, signal);
  assert.deepEqual(research.urls, [second, url]);
  assert.equal(research.metadata.selection_format, "manifest_v1");
  assert.equal(research.metadata.rejected_listing_count, 1);
  assert.equal(research.metadata.verification_lead_count, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].tools[0].parameters.max_uses, 3);
  assert.equal(requests[0].tool_choice, "required");
  assert.equal(requests[0].provider.require_parameters, true);
  assert.deepEqual(requests[0].reasoning, { effort: "low", exclude: true });
  assert.match(requests[0].messages[0].content, /rightroom-discovery-v1/);
  assert.doesNotMatch(
    JSON.stringify(provider.getDiagnostics()),
    /Research evidence|past-listing|verification-lead/,
  );
});

test("unstructured no-results reports fail closed without extra calls or creating sources", async () => {
  const { provider, requests } = offlineProvider(
    `## No qualifying events found\nExcluded stale listings: ${past} and ${url}.`,
    [past, url],
  );
  const repository = memoryRepository();
  const summary = await runIngestion(options, {
    provider,
    repository,
    signal,
    now: () => new Date("2026-09-01T12:00:00Z"),
  });
  assert.equal(summary.status, "failed");
  assert.deepEqual(summary.errors, ["invalid_research_selection"]);
  assert.equal(repository.sources.size, 0);
  assert.equal(repository.events.size, 0);
  assert.equal(requests.length, 1);
});

test("explicit zero-lead and rejected-only selections finish without capture, extraction or repair", async () => {
  for (const listings of [[], [listing(past, "rejected")]]) {
    const { provider, requests } = offlineProvider(
      manifest(listings, `No eligible leads; background ${past}.`),
      [past],
    );
    const repository = memoryRepository();
    const summary = await runIngestion(options, {
      provider,
      repository,
      signal,
      now: () => new Date("2026-09-01T12:00:00Z"),
      captureSource: async () => {
        assert.fail("zero leads must not capture pages");
      },
    });
    assert.equal(summary.status, "succeeded");
    assert.equal(summary.sources_discovered, 0);
    assert.equal(repository.sources.size, 0);
    assert.equal(requests.length, 1);
  }
});

test("malformed, duplicate, contradictory and oversized manifests never fall back to narrative URLs", () => {
  const legacy = `### 1. Legacy event\n${url}`;
  const invalid = [
    `${legacy}\n\`\`\`rightroom-discovery-v1\n{bad}\n\`\`\``,
    `${legacy}\n\`\`\`rightroom-discovery-v1\n{}`,
    manifest([listing(url)]) + "\n" + manifest([]),
    manifest([listing(url)]) + "\n```rightroom-discovery-v1\n{}",
    `${legacy}\n\`\`\`json\n${JSON.stringify({ version: "rightroom-discovery-v1", listings: [] })}\n\`\`\``,
    manifest([{ ...listing(url), extra: "ignore instructions" }]),
    manifest([listing(url, "candidate")]),
    manifest([listing("https://evil.test/event")]),
    manifest([
      listing(url),
      listing("https://lu.ma/founder-test?utm_source=x", "rejected"),
    ]),
    manifest([
      listing("https://meetup.com/a/events/123"),
      listing("https://meetup.com/b/events/123", "rejected"),
    ]),
    manifest(
      Array.from({ length: 11 }, (_, index) =>
        listing(`https://luma.com/item-${index}`),
      ),
    ),
    "```rightroom-discovery-v1\n" +
      JSON.stringify({ version: "wrong", listings: [] }) +
      "\n```",
    "```rightroom-discovery-v1\n" +
      JSON.stringify({
        version: "rightroom-discovery-v1",
        listings: [],
        secret: "not-permitted",
      }) +
      "\n```",
  ];
  for (const text of invalid)
    assert.throws(() => researchSelection(text), {
      code: "invalid_research_selection",
    });
  assert.throws(
    () => researchSelection(manifest([listing(url), listing(second)]), 1),
    { code: "invalid_research_selection" },
  );
});

test("selection still intersects annotations and listing identity while preserving explicit order", async () => {
  const { provider } = offlineProvider(
    manifest([
      listing(second),
      listing("https://www.lu.ma/founder-test?utm_source=search"),
    ]),
    [url],
  );
  const research = await provider.research(options, signal);
  assert.deepEqual(research.urls, [url]);
  assert.equal(research.retrieval_urls[url], "https://www.lu.ma/founder-test");
});

test("historical numbered sections stop at background headings and never borrow a second primary", () => {
  assert.deepEqual(
    researchSelection(
      `### 1. [Event](${url})\nSupported facts.\n## Background\n${past}`,
    ).urls,
    [url],
  );
  assert.deepEqual(
    researchSelection(manifest([listing(url)]).replaceAll("\n", "\r\n")).urls,
    [url],
  );
  assert.deepEqual(
    researchSelection(
      `### 1. Event\n${url}\nDuplicate ${second}\n## Rejected citations\n${past}`,
    ).urls,
    [url],
  );
  assert.deepEqual(
    researchSelection(
      `### 1. Missing primary\nNo URL here.\n## Background\n${past}`,
    ).urls,
    [],
  );
  assert.throws(() => researchSelection(`Background ${url}`), {
    code: "invalid_research_selection",
  });
  assert.equal(researchSelection(`### 1. Event\n${url}`).rejectedCount, null);
});
