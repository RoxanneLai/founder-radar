import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";
import next from "next";
import { fakeKey, publishedRow } from "./dashboard/helpers.mjs";
import { assertDashboardHtml } from "./assert-dashboard.mjs";

let databaseServer;
let appServer;
let app;
let appUrl;
let databaseUrl;
let responseRows = [];
let responseStatus = 200;
let delay = 0;
let databaseCalls = 0;
let lastDatabaseHeaders;
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
};

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

function upcomingRow(overrides = {}) {
  return publishedRow({
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  });
}

async function page(path = "/", userAgent = "Googlebot") {
  const response = await fetch(appUrl + path, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  return { html: await response.text(), headers: response.headers };
}

before(
  async () => {
    databaseServer = createServer(async (request, response) => {
      databaseCalls += 1;
      lastDatabaseHeaders = request.headers;
      if (
        request.method !== "GET" ||
        !request.url.startsWith("/rest/v1/events?")
      ) {
        response.writeHead(405).end();
        return;
      }
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      response.writeHead(responseStatus, {
        "Content-Type": "application/json",
      });
      response.end(
        JSON.stringify(
          responseStatus === 200
            ? responseRows
            : { message: "PRIVATE PROVIDER ERROR" },
        ),
      );
    });
    databaseUrl = await listen(databaseServer);
    process.env.SUPABASE_URL = databaseUrl;
    process.env.SUPABASE_ANON_KEY = fakeKey();
    app = next({ dev: false, dir: process.cwd() });
    await app.prepare();
    const handle = app.getRequestHandler();
    appServer = createServer((request, response) => handle(request, response));
    appUrl = await listen(appServer);
  },
  { timeout: 30000 },
);

after(async () => {
  await close(appServer);
  if (app) await app.close();
  await close(databaseServer);
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("production cards expose reviewed registration links without leaking private URLs", async () => {
  responseRows = [
    upcomingRow({
      public_registration_url: "https://luma.com/synthetic-reviewed-event",
      source_url: "https://luma.com/private?token=secret",
    }),
  ];
  let { html } = await page();
  assert.match(html, /href="https:\/\/luma.com\/synthetic-reviewed-event"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.match(html, /View event &amp; registration/);
  assert.doesNotMatch(html, /token=secret|luma.com\/private/);
  responseRows = [
    upcomingRow({
      public_registration_url:
        "https://luma.com/synthetic-reviewed-event?secret=private",
    }),
  ];
  ({ html } = await page());
  assert.match(html, /Registration link not available/);
  assert.doesNotMatch(html, /secret=private/);
});

test("production route renders fresh published records and never exposes private fields", async () => {
  responseRows = [
    upcomingRow({
      title: "Runtime published record",
      raw_payload: "PRIVATE SOURCE PAYLOAD",
    }),
    upcomingRow({ title: "PRIVATE DRAFT TITLE", publication_status: "draft" }),
    upcomingRow({
      title: "PRIVATE ARCHIVE TITLE",
      publication_status: "archived",
    }),
    upcomingRow({ title: "HIDDEN FIXTURE TITLE", is_fixture: true }),
  ];
  const { html, headers } = await page();
  assert.match(html, /Runtime published record/);
  assert.match(html, /Price not listed/);
  assert.match(html, /Not scored/);
  assert.match(html, /Organizer not listed/);
  assert.match(html, /End time not listed/);
  assert.match(html, /Recommendation pending/);
  assert.match(html, /Registration status not listed/);
  assert.doesNotMatch(
    html,
    /PRIVATE|HIDDEN FIXTURE|test-signature|sb_secret|Sample listing · no registration/,
  );
  assert.doesNotMatch(html, /Networking score: 0 out of 100/);
  assert.equal((html.match(/<article\b/g) ?? []).length, 1);
  assert.match(headers.get("cache-control") ?? "", /no-store/);
  const callsBefore = databaseCalls;
  responseRows = [
    upcomingRow({
      title: "Updated record after first request",
      price_amount_cents: 1250,
      currency_code: "USD",
      networking_score: 0,
    }),
  ];
  const updated = await page();
  assert.match(updated.html, /Updated record after first request/);
  assert.doesNotMatch(updated.html, /Runtime published record/);
  assert.match(updated.html, /\$12.50/);
  assert.match(updated.html, /Networking score: 0 out of 100/);
  assert.equal(databaseCalls, callsBefore + 1);
});

test("production route distinguishes an empty database from a connection failure and recovers", async () => {
  responseRows = [];
  assert.match((await page()).html, /No published events yet/);
  responseStatus = 503;
  const callsBefore = databaseCalls;
  const { html } = await page();
  assert.match(html, /The event feed is temporarily unavailable/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /PRIVATE PROVIDER ERROR|mock-\d|Sample listing/);
  assert.equal(databaseCalls, callsBefore + 1);
  responseStatus = 200;
  responseRows = [upcomingRow({ title: "Recovered database record" })];
  assert.match((await page()).html, /Recovered database record/);
});

test("runtime configuration is read at request time without freezing it into the build", async () => {
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_ANON_KEY = "";
  const callsBefore = databaseCalls;
  const { html } = await page();
  assert.match(html, /The event feed is not connected yet/);
  assert.doesNotMatch(html, /<article\b/);
  assert.equal(databaseCalls, callsBefore);
  process.env.SUPABASE_URL = databaseUrl;
  process.env.SUPABASE_ANON_KEY = fakeKey();
});

test("the sample route remains available without touching the database", async () => {
  const callsBefore = databaseCalls;
  const { html } = await page("/sample");
  assertDashboardHtml(html);
  assert.equal(databaseCalls, callsBefore);
});

test("auth-disabled local mode sends no placeholder or privileged credentials", async () => {
  process.env.SUPABASE_ANON_KEY = "";
  responseRows = [upcomingRow({ title: "Anonymous local record" })];
  try {
    const { html } = await page();
    assert.match(html, /Anonymous local record/);
    assert.equal(lastDatabaseHeaders.authorization, undefined);
    assert.equal(lastDatabaseHeaders.apikey, undefined);
    assert.doesNotMatch(html, /local-anonymous|test-signature/);
  } finally {
    process.env.SUPABASE_ANON_KEY = fakeKey();
  }
});

test("browser requests stream a loading state before the database result", async () => {
  delay = 500;
  responseRows = [upcomingRow({ title: "Delayed published record" })];
  try {
    const response = await fetch(appUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let first = "";
    while (!first.includes("Loading your shortlist")) {
      const chunk = await reader.read();
      assert.equal(
        chunk.done,
        false,
        "Expected loading state before the stream ended",
      );
      first += decoder.decode(chunk.value, { stream: true });
    }
    assert.doesNotMatch(first, /Delayed published record/);
    let rest = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest += decoder.decode(chunk.value, { stream: true });
    }
    assert.match(rest, /Delayed published record/);
  } finally {
    delay = 0;
  }
});
