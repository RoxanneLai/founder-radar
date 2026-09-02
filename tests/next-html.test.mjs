import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { assertDashboardHtml } from "./assert-dashboard.mjs";

test("the standard Next.js build preserves the separate fictional sample edition", async () => {
  const html = await readFile(
    new URL("../.next/server/app/sample.html", import.meta.url),
    "utf8",
  );
  assertDashboardHtml(html);
});

test("the published feed is dynamic while the sample edition is prerendered", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../.next/prerender-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.routes["/"], undefined);
  assert.ok(manifest.routes["/sample"]);
});
