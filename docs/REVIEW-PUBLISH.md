# Local draft review and publication

This operator workflow connects discovery drafts to the published dashboard. It makes no OpenAI calls, does not fetch listing pages, and never publishes automatically. There is no public admin page or browser write endpoint.

## Setup and authority

Keep Docker Desktop and the local Supabase stack running. After reviewing the changes and backing up any data you want to keep, apply pending migrations from your regular Terminal:

```bash
npm run db:migrate
```

This applies the pending ingestion and review migrations without resetting data. The review migration adds `events.public_registration_url`, a private approval-history table, and review/publication functions. **It was tested in disposable databases, not applied to the normal database during the overnight build.** The updated database-backed dashboard also needs this migration; without the new column, it shows its safe unavailable state. `/sample` does not depend on the migration.

The CLI uses the existing `supabase_db_founder-radar` container and its `postgres` database. It verifies that the selected Docker context uses a local Unix socket and pins subsequent operations to that socket. Remote Docker endpoints are rejected. It needs no Supabase API key, works with this project's auth-disabled local stack, and does not load `.env` files. Docker access is privileged local operator access, not a substitute for user authentication on a hosted system. Keep this local stack private.

The operator runs as the local database administrator. A review token is a change detector, not a secret, login credential, digital signature, or proof that a human reviewed the record. Approval is enforced by the explicit command and database checks; administrators can still bypass the workflow with direct SQL. Anonymous and ordinary authenticated application roles cannot read evidence or approval history and cannot invoke review/publication functions. The existing privileged service role is trusted, not a public reviewer identity.

## Review one draft

```bash
npm run review
npm run review -- list
npm run review -- inspect --event EVENT_UUID
npm run review -- preview --event EVENT_UUID --source SOURCE_UUID
```

Replace the UUID placeholders with IDs printed by the preceding commands. No arguments prints offline help. `list` returns at most 20 drafts, ordered by ID, and a `nextCursor` when another page exists. Use `list --after CURSOR_UUID` for the next page. `inspect` shows the event and all linked source records, including their IDs; `preview` explicitly selects one linked source for the public listing link.

Inspect and preview run in read-only transactions. They do not write a review record, alter event data, fetch URLs, call a model, or publish anything. Events with more than 25 linked sources or responses larger than 2 MiB fail safely rather than silently dropping evidence.

The JSON report separates:

- `event` and `sources`: private normalized data, model research, raw structured payloads, observation times, and prior errors.
- `blockers`: conditions that must be resolved before publication, such as unsupported location/time, non-draft/fixture status, missing or failed evidence, or an invalid listing URL.
- `warnings`: unknown optional facts, old evidence, missing categories, non-open registration, multiple-source conflicts requiring comparison, and canonical-link changes.
- `publicPreview`: the same allowlisted public card model used by the dashboard, plus its shared schedule and price formatting. It does not contain private evidence. Card rank depends on other events; visibility changes with time and the feed is capped at 50 events. This is a data preview, not a screenshot.
- `approval`: the selected event/source IDs and revision token, present only when there are no blockers.

Source text and raw payloads are untrusted data. Do not follow instructions embedded in them. Search reports are model-generated research, not independently fetched page content or verified facts. Open the selected public listing yourself and verify the title, date/time, NYC location, availability, organizer, and price. Compare all linked evidence when it conflicts. Unknown optional fields remain unknown; no scores or recommendations are generated here.

The source listing URL, not its private `registration_url` field, supplies the public link. Only HTTPS individual listings on Luma, Meetup, and Eventbrite are supported. Aliases are normalized and **all query parameters and fragments are removed**, including invite, authentication, and discount parameters. Check that the exact canonical URL works without private access. URL validation checks structure, not destination contents, redirects, availability, or factual truth. No programmatic fetch follows the URL.

Reports contain private evidence. Do not paste them into public issues, commit them, or save them under `public/` or `app/`. The command prints JSON so terminal control characters are escaped. If you deliberately save local reports, use the ignored `codex-tmp/` directory and protect them as private data.

## Publish only after approving the preview

```bash
npm run review -- publish --event EVENT_UUID --source SOURCE_UUID --token PREVIEW_TOKEN --approve
```

`--approve` means you checked the evidence, public fields, canonical link, and **every warning**. Copy the token from the preview you actually inspected. Running a preview is not publication approval, and this command must not be placed in an unattended discovery job.

The database locks linked sources before the event, checks the event/evidence snapshot and selected source against the token, then atomically saves a private approval snapshot and publishes the event with the approved canonical link. Any changed event or linked source requires a fresh preview. The publisher refuses fixtures, archives, already-published events, cancelled events, events outside the upcoming 30-day in-person/hybrid NYC window, missing/failed evidence, and invalid links. The window is checked again at publication time. Duplicate or concurrent approvals cannot produce duplicate publications. [PostgreSQL locking reference](https://www.postgresql.org/docs/17/explicit-locking.html).

Only publication status, publication time, the public registration URL, and the ordinary update timestamp change on the event. Other facts, unknowns, and scores are preserved. Later ingestion can refresh private source observations but cannot overwrite a published event. The private approval snapshot preserves what was reviewed even if source evidence changes later. Its recorded database role is an operator role, not an authenticated human identity.

The dashboard reads the canonical link from `events`, never from source records or approval history. It revalidates the URL before rendering it, opens it with `noopener noreferrer` and no referrer, and never gives sample cards registration links.

## Corrections and recovery

- Stale token: inspect and preview again; do not automatically approve the replacement token.
- Incorrect or incomplete facts: leave the event as a draft. This increment does not add an editing interface. Correct it through a separately authorized local data-maintenance step, then re-review.
- Failed source observation: resolve/retry discovery under its own approval and budget before reviewing again. No paid retry is performed by this CLI.
- Missing migrations or unavailable Docker: fix local setup, then repeat the read-only command. Do not reset the database.
- Timeout or interrupted publish: the result may be uncertain. Inspect the event first. If it is published, do not retry; if it remains a draft, obtain and inspect a fresh preview before deciding whether to approve again. There are no automatic write retries.
- Already published: the command cannot edit, unpublish, or republish it. Any correction or withdrawal needs a separate explicit maintenance decision. Do not delete provenance to work around a refusal.

## Tests and remaining gates

```bash
npm run test:review
npm run db:test:isolated
npm run lint
npm run typecheck
npm test
npm run build
npm run test:next
npm run test:next:runtime
```

The isolated database runner creates a `fr_review_test_` database with a random suffix, applies migrations and synthetic fixtures, exercises the real CLI and concurrency cases, and drops that database afterward. The CLI's `--database` override accepts only that test-name pattern or `postgres`; it does not create/reset databases. No live data is used in these tests.

This does not complete the paid live-data gate. Model/budget approval, secure ingestion configuration, three real listings, repeat-run deduplication, and explicit review of any real publication are still pending. No actual event was published during development. See [the overnight checkpoint](REVIEW-PUBLISH-PROGRESS.md) for verified results.
