# FounderRadar V1 plan

## Outcome

V1 establishes a reproducible database and a server-side data boundary for FounderRadar. It is complete when a fresh local Supabase instance can be created from versioned migrations and the existing dashboard can render seeded events from Postgres.

The first V1 increment in this repository covers the database foundation. The user's next priority is a live-data agent. The proposed next increment pairs the ingestion boundary with one manually triggered provider adapter; connecting the UI can then expose that real data.

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
- The six V0 fixtures are seeded with deterministic UUIDs, `is_fixture = true`, and `.invalid` source URLs. A future live feed must filter out fixtures and retain clear sample labeling when deliberately showing them.

## Foundation completion criteria

- `npm run db:start` starts the local Supabase stack.
- `npm run db:reset` recreates the database from migrations and seed data.
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
- The agent's shell can reach the Docker socket but cannot reach the host's published Postgres port. The standard `db:reset`, `db:test`, and `db:lint` command path still needs a host-Terminal verification pass.
- The user confirmed that the production build passes in the host Terminal, and the production HTML test subsequently passed against that output. The agent's build attempt was blocked by `EPERM` during cleanup of `.next/diagnostics`, including on an elevated attempt. Application source was not changed by this database milestone.

## Next increment: one live-data agent

Build a small server-side ingestion module alongside the first provider adapter, with operations for:

1. starting and completing a search run;
2. upserting a source by provider URL or external ID;
3. preserving `first_seen_at` while advancing `last_seen_at` and `fetched_at`;
4. recording fetch failures without discarding earlier successful content;
5. linking an extracted source to a canonical event;
6. generating TypeScript types from the local schema.

Provider adapters should return one shared discovery result shape and should not write SQL directly. That boundary will let the first internet agent evolve without coupling the database to a particular search service.

Start with one agreed public source, a short NYC date range, and a small result limit. Persist real URLs and fetch timestamps, keep missing fields and uncomputed scores unknown, and keep incomplete events as drafts. Treat page content as untrusted data, restrict fetch targets and redirects, and bound requests, retries, and any model cost. Scheduling, multi-provider discovery, and semantic deduplication are not prerequisites for this first live-data slice.

## Deferred work

- Connecting `app/page.tsx` to Supabase
- Hosted Supabase project creation and deployment
- Provider selection and internet discovery
- Structured extraction and scoring
- Deduplication across providers
- Authentication, personalization, notifications, and scheduling
