import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertDashboardHtml } from "./assert-dashboard.mjs";

test("the standard Next.js build renders the complete V0 dashboard", async () => {
  const html = await readFile(
    new URL("../.next/server/app/index.html", import.meta.url),
    "utf8",
  );
  assertDashboardHtml(html);
});
