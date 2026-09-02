import assert from "node:assert/strict";

export function assertDashboardHtml(html) {
  assert.match(html, /<title>FounderRadar — Sample edition<\/title>/);
  assert.doesNotMatch(html, /codex-preview|Starter Project/);
  assert.match(html, /Fictional events, sample scores/);
  assert.match(html, /These are not live listings/);
  assert.match(html, /Sample edition · All listings are fictional/);
  assert.match(html, /href="\/"/);
  assert.equal((html.match(/<article\b/g) ?? []).length, 6);
  assert.equal((html.match(/<h4[^>]*>/g) ?? []).length, 6);
  assert.equal((html.match(/class="downside"/g) ?? []).length, 5);
  const scores = [
    ...html.matchAll(/aria-label="Networking score: (\d+) out of 100"/g),
  ].map((m) => Number(m[1]));
  assert.deepEqual(scores, [94, 91, 86, 84, 80, 76]);
  assert.match(html, /Almost full/);
  assert.match(html, /Waitlist/);
  assert.match(html, /Registration open/);
  assert.match(html, /EDT/);
  assert.match(html, /href="#picks"/);
  assert.doesNotMatch(html, /<a[^>]+href="https?:/);
}
