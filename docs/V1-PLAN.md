# FounderRadar V1 plan

## Outcome

V1 establishes a reproducible database and a server-side data boundary for FounderRadar. The database foundation is implemented. The full V1 application milestone is complete when a fresh local Supabase instance can be created from versioned migrations and the existing dashboard can render events from Postgres, with fictional fixtures clearly distinguished from live listings.

The database foundation, first ingestion implementation, and dashboard read boundary are now present. The ingestion boundary pairs with one manually triggered OpenAI web-search adapter. See the [ingestion checkpoint](INGESTION-PROGRESS.md) and [dashboard checkpoint](INTEGRATION-PROGRESS.md) for verification. Live API validation remains a separate, unverified gate.

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

The first discovery provider is OpenAI hosted web search, restricted to individual listing URLs on Luma, Meetup, and Eventbrite. Search reports are explicitly labeled model-generated evidence, not independently downloaded page content. A second tool-free structured-output request extracts facts and quotes. Unknown core fields leave a source unlinked; optional fields and uncomputed scores remain unknown; all usable events remain drafts.

The manual command defaults to a no-network plan. Live mode requires two explicit opt-ins, an explicit model and server-side credentials, and a local-only database URL. Work is bounded to two model requests, three search-tool calls, a short date window, and at most ten candidates, with no automatic API retries. These are request bounds, not a dollar-exact budget.

The new transactional RPC preserves source identity, successful evidence after failures, original discovery attribution, and reviewed/published events. The implementation does not yet independently verify semantic truth or deduplicate the same event across platforms. See [the ingestion guide](INGESTION.md) for limits, evidence semantics, verification, and recovery.

## Dashboard integration — September 2, 2026

The main route now reads published, non-fixture events through a server-only anonymous Supabase client. It shows the next 30 days of in-person or hybrid NYC events, excludes cancelled listings, preserves unknown prices/scores, and supports loading, empty, unconfigured, and unavailable states. The sample edition is separate and never a silent fallback. Page loads cannot publish drafts, read private evidence, or trigger paid requests.

The code and automated tests are implemented; see [the dashboard guide](DASHBOARD.md) for local public-read setup and [integration progress](INTEGRATION-PROGRESS.md) for the exact verification results.

## Draft review and publication — September 2, 2026

A local operator CLI now lists drafts, inspects private evidence, previews the shared public card model, and publishes one event only with explicit approval and a matching event/evidence revision token. Publication records a private approval snapshot and a canonical listing URL, without exposing source payloads or generating missing facts. Concurrent approvals are serialized and later ingestion preserves published event fields. Public application roles cannot review or publish. See [the operator guide](REVIEW-PUBLISH.md) and [verification checkpoint](REVIEW-PUBLISH-PROGRESS.md). This increment remains local-only; its migration must be deliberately applied to the normal database before use.

### Next acceptance gate: a paid live smoke test

After approval of a separate API testing budget, run the command against a current date window and manually verify three real NYC events and their source evidence. Rerun the same window to verify stable source identities and inspect actual usage before expanding the search. This live gate was deliberately excluded from the overnight build and has not been claimed complete.

## Later work

- Hosted Supabase project creation and deployment
- Additional discovery providers and richer extraction
- Structured scoring and explanations
- Deduplication across providers
- Authentication, personalization, notifications, and scheduling
