# FounderRadar V1 plan

## Outcome

V1 establishes a reproducible database and a server-side data boundary for FounderRadar. The database foundation is implemented. The full V1 application milestone is complete when a fresh local Supabase instance can be created from versioned migrations and the existing dashboard can render events from Postgres, with fictional fixtures clearly distinguished from live listings.

The database foundation, ingestion implementation, and dashboard read boundary are now present. The ingestion boundary uses OpenRouter with configurable primary and schema-repair model/effort pairs; the original direct OpenAI adapter has been replaced. See the [ingestion guide](INGESTION.md) for current configuration. Earlier [ingestion](INGESTION-PROGRESS.md) and [dashboard](INTEGRATION-PROGRESS.md) checkpoints are historical records. Live discovery has produced drafts, two earlier drafts were manually validated and imported, and one stale recurring event was archived with its audit evidence intact. Source-fetch responses also exposed noncanonical candidate envelopes. Known safe variants are normalized deterministically; an optional tool-free repair request handles other source-complete schema variants under scalar-preservation checks. Qwen repair-only checks failed closed at both no and low effort. Three Muse Spark 1.3 Contributor checks were denied by OpenRouter before provider execution. Luna at medium effort is now the repair default. Its isolated repair check passed, and a fresh end-to-end run subsequently wrote two source-linked drafts with no errors. Review cleanup is complete; a separately approved repeat-run deduplication check and a publication decision for the remaining draft remain.

## Why provenance comes first

The next major product capability is an agent that discovers event listings on the internet. A discovered listing is not automatically a trustworthy canonical event: its fields may be incomplete, the same event may appear on several sites, and extraction may fail.

The schema therefore separates three stages:

```text
search_runs -> event_sources -> events -> published application data
```

- `search_runs` records who searched, where, with what parameters, and whether the run succeeded.
- `event_sources` stores provider identifiers, URLs, fetch metadata, content, and raw structured payloads. Its `event_id` is nullable so discovery does not depend on successful extraction.
- `events` contains normalized product data. Multiple source records can eventually point to one canonical event.

## Database decisions

- UUID primary keys avoid coordination between agents and providers.
- All event instants use `timestamptz`; the IANA `time_zone` value is stored separately for display.
- Prices use integer minor units plus an ISO-style currency code. Unknown prices remain `NULL`; free USD events use `0` and `USD`.
- Scores and recommendation text are nullable. Discovery can store factual event data before a later scoring stage exists.
- Source identity is protected by unique indexes on `(source_name, external_id)` when an external ID exists and on `(source_name, source_url)`.
- Raw provider payloads use `jsonb`; extracted page text and a content hash have dedicated columns. A source stores the latest snapshot and its original discovery run, not an append-only history of every fetch.
- Row-level security exposes only `published` events to anonymous and authenticated application roles. Source payloads and run diagnostics have no public policies.
- The six V0 fixtures are seeded with deterministic UUIDs, `is_fixture = true`, and `.invalid` source URLs. The main feed excludes fixtures; `/sample` retains the original clearly labeled sample edition.

## Foundation completion criteria

- `npm run db:start` starts the local Supabase stack.
- On a disposable local database, `npm run db:reset` recreates the database from migrations and seed data. Do not reset a database containing live data you want to keep.
- `npm run db:test` passes the pgTAP contract tests.
- `npm run db:lint` reports no database errors.
- Six published fixture events, six linked source records, and one completed fixture search run exist after reset.
- An unlinked `event_sources` row can be inserted for a newly discovered listing.
- Public roles can read published events but cannot read source payloads or search-run diagnostics.

## Verification status — September 1, 2026

- The migration and seed were applied successfully to a fresh, disposable Supabase PostgreSQL 17 container.
- The regular local Supabase stack was started from the user's host Terminal; migration `20260901160000` and all six seed events were confirmed there.
- All 47 pgTAP assertions passed in both databases using `docker exec` and `psql`; each test runs in a transaction and rolls back.
- Application lint, TypeScript, and all six existing unit tests passed.
- Docker socket access and a connection to the published Postgres port through the allowed network proxy were verified. Direct database connections from the agent's shell remain blocked; the standard `db:reset`, `db:test`, and `db:lint` command path still needs a host-Terminal verification pass. Database contract tests can run through Docker without changing network permissions.
- The user confirmed that the production build passes in the host Terminal, and the production HTML test subsequently passed against that output. The agent's build attempt was blocked by `EPERM` during cleanup of `.next/diagnostics`, including on an elevated attempt. Application source was not changed by this database milestone.

### Subsequent repository cleanup

- The V0 guides were moved into `docs/archive/`; their original bodies were preserved. Unused starter assets, duplicate commands, obsolete lint exceptions, and unused styling dependencies were removed.
- Lint, TypeScript, all six unit tests, formatting, dependency-lock consistency, and local documentation links passed after cleanup. The running development server also passed the dashboard HTML assertions.
- Browser comparisons at 1280×720 and 390×844 found no changes to the measured layout or computed styles of the dashboard's 584 elements, with no horizontal overflow or browser warnings/errors.
- The user confirmed that both `npm run build` and `npm run test:next` passed in the host Terminal after cleanup, completing production verification. The agent's normal and approved elevated build attempts remained blocked by the `.next/diagnostics` permission error.

## Current increment: one live-data agent

The server-side ingestion module now implements the first provider adapter, with operations for:

1. starting and completing a search run;
2. upserting a source by provider URL or external ID;
3. preserving `first_seen_at` while advancing `last_seen_at` and `fetched_at`;
4. recording fetch failures without discarding earlier successful content;
5. linking an extracted source to a canonical event;
6. generating TypeScript types from the local schema.

Provider adapters should return one shared discovery result shape and should not write SQL directly. That boundary will let the first internet agent evolve without coupling the database to a particular search service.

The current discovery provider uses OpenRouter's hosted web-search server tool with Exa, restricted to individual listing URLs on Luma, Meetup, and Eventbrite. Primary and repair model/reasoning-effort defaults come from `config/ingestion.json` and can be overridden independently from the CLI; all requests exclude reasoning traces. The private credential is read from ignored `OPENROUTER.key` only in live mode. Requests opt into router metadata, but diagnostics retain only an allowlisted access-denial category and bounded counts—never provider messages, pipeline details, prompts, source content, credentials, or reasoning traces. A second structured-output request uses OpenRouter's domain-restricted direct web-fetch tool exactly once per retained source; it returns a fact-free rejection verdict when the current listing conflicts with the search report. If that response has exact trusted source coverage but only a noncanonical schema, at most one configured repair request may transform its JSON without tools or new facts. Stored evidence is still a model-interpreted report and fetch metadata, not a page archive. Unknown core fields leave a source unlinked; optional fields and uncomputed scores remain unknown; all usable events remain drafts.

The manual command defaults to a no-network plan showing both selected model/effort pairs. Live mode requires two explicit opt-ins, the key file and server-side database credentials, and a local-only database URL. Work is bounded to two primary API requests plus at most one conditional repair, three hosted searches, one hosted fetch slot per retained source, a short date window, and at most ten candidates, with no automatic API retries. Hosted tools may involve internal model turns and reasoning tokens count as output tokens. These are request bounds, not a dollar-exact budget. Each extraction request's schema requires exactly one candidate verdict per selected source. If the response omits its search counter, 1–15 valid provider citations authorize extraction while leaving query count unknown. A missing fetch counter requires exact unique source-verdict coverage under the required-tool bounds; explicit zero or mismatched counters fail closed. See `docs/INGESTION.md` for limits and live acceptance.

The new transactional RPC preserves source identity, successful evidence after failures, original discovery attribution, and reviewed/published events. The implementation does not yet independently verify semantic truth or deduplicate the same event across platforms. See [the ingestion guide](INGESTION.md) for limits, evidence semantics, verification, and recovery.

## Dashboard integration — September 2, 2026

The main route now reads published, non-fixture events through a server-only anonymous Supabase client. It shows the next 30 days of in-person or hybrid NYC events, excludes cancelled listings, preserves unknown prices/scores, and supports loading, empty, unconfigured, and unavailable states. The sample edition is separate and never a silent fallback. Page loads cannot publish drafts, read private evidence, or trigger paid requests.

The code and automated tests are implemented; see [the dashboard guide](DASHBOARD.md) for local public-read setup and [integration progress](INTEGRATION-PROGRESS.md) for the exact verification results.

## Draft review and publication — September 2, 2026

A local operator CLI now lists drafts, inspects private evidence, previews the shared public card model, and publishes one event only with explicit approval and a matching event/evidence revision token. Publication records a private approval snapshot and a canonical listing URL, without exposing source payloads or generating missing facts. Concurrent approvals are serialized and later ingestion preserves published event fields. Public application roles cannot review or publish. See [the operator guide](REVIEW-PUBLISH.md) and [verification checkpoint](REVIEW-PUBLISH-PROGRESS.md). This increment remains local-only; its migration must be deliberately applied to the normal database before use.

### Next acceptance gate: live source verification

A bounded Luna replay wrote real drafts; manual review accepted two current listings and caught one stale recurring-event date. The accepted drafts were imported through normal validation, and the stale draft was archived without erasing provenance. The optional Luna schema repair passed against the preserved noncanonical response without repeating search or writing to the database. Fresh run `a1344244-a8ee-4361-bc79-cb0ada11b150` then discovered two sources and wrote two drafts with exact source coverage, accepted repair, and no errors. Manual source review found that one event had begun four minutes before persistence because the explicit window started at midnight; the operator workflow blocked it, and it was archived without deleting evidence. The other remained upcoming and matched its Meetup listing, while its secondary ticket page could not be independently checked due to rate limiting. Its preview had no blockers but retained honest warnings and remains unpublished. Both sandbox-interrupted zero-source runs were finalized as cancelled. Separately approve one repeat of the same bounded window to confirm source reuse before expanding the search.

## Later work

- Hosted Supabase project creation and deployment
- Additional discovery providers and richer extraction
- Structured scoring and explanations
- Deduplication across providers
- Authentication, personalization, notifications, and scheduling
