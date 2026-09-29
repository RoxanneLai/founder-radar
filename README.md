# FounderRadar

**Don’t show me every startup event. Show me the ones worth attending.**

FounderRadar is becoming an event intelligence pipeline for finding and explaining the NYC startup events most worth attending.

## Current milestone: local-first event pipeline

V0 is complete: the repository contains a working static Next.js prototype with six fictional events and deterministic ranking. V1 now has a local-first persistence layer, a bounded manually triggered ingestion agent, live draft collection, and a human review boundary. Live runs remain unpublished until explicit approval.

The main dashboard at `http://localhost:3000` reads published, non-fixture NYC events from SQLite by default. The fictional edition is separately available at `http://localhost:3000/sample`. Database errors and an empty feed have distinct states; they never silently substitute sample events. Supabase remains available through explicit configuration.

See [the storage guide](docs/STORAGE.md) for SQLite, backend selection, import, backups, and deployment limits. The [dashboard guide](docs/DASHBOARD.md), [ingestion guide](docs/INGESTION.md), [quality-evaluation guide](docs/INGESTION-EVALUATION.md), and [review guide](docs/REVIEW-PUBLISH.md) cover each workflow. Historical readiness and integration checkpoints describe the earlier Supabase-first implementation.

The local [draft-review workflow](docs/REVIEW-PUBLISH.md) lets an operator list upcoming and expired drafts separately, inspect private evidence, preview public card data, and explicitly approve one event for publication. Only the reviewed canonical listing URL becomes public; stale approvals are rejected. Run `npm run review` for offline help. No real events were published during the historical [overnight verification](docs/REVIEW-PUBLISH-PROGRESS.md).

### Preview an ingestion run without spending money

```bash
npm run ingest -- --limit 3
```

After installing dependencies, this prints a plan only: no API requests, key-file reads, database initialization, or writes. The agent uses OpenRouter, with primary and schema-repair model/effort defaults in `config/ingestion.json` and independent per-run overrides. A live run makes two primary requests and, only for a safely source-scoped noncanonical JSON response, at most one tool-free repair request. Live mode reads your ignored `OPENROUTER.key` file and still requires explicit opt-in and a separately approved testing budget. Supabase credentials are required only when that backend is selected.

Completed local runs can be inspected without paid requests or database writes using `npm run ingest:inspect -- --run RUN_UUID`. The report contains safe diagnostics and source identities, never source content or raw payloads.

Historical ingestion quality can be measured offline with `npm run ingest:evaluate -- run`. The evaluator opens the selected SQLite database read-only, merges only allowlisted aggregate fields from ignored checkpoints, and writes an owner-only aggregate report under `codex-tmp/`. It does not read a key, contact a provider, modify the database, or publish events.

Private saved provider responses can be replayed through the current adapter with `npm run ingest:replay -- run --manifest codex-tmp/capture-replay-manifest.json`. Replay is SQLite-only and offline: it reads no credentials, makes no paid calls, and writes neither database rows nor publication changes. Its ignored manifest distinguishes original failure captures from later diagnostic captures.

## Run the web application

Use Node.js 24 LTS and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

No database configuration is needed for the default SQLite dashboard. Its persistent ignored file is created automatically. No service-role key or OpenRouter key is needed for page loads. A new database is intentionally empty; open `/sample` to see the demo. Starting the page does not run discovery or publish anything.

## Storage

SQLite is the default and needs no separate process. All local workflows use `data/founder-radar.sqlite` unless `SQLITE_DATABASE_PATH` overrides it. Set `DATABASE_BACKEND=supabase` to opt into the retained Supabase implementation; there is no automatic fallback or data transfer.

See [the storage guide](docs/STORAGE.md) before importing, backing up, restoring, or deploying data.

### Optional local Supabase

Local Supabase requires a Docker-compatible container runtime. Start your runtime, then start the optional local stack:

```bash
npm run db:start
```

Supabase Studio runs at http://localhost:54323. Stop the local stack with `npm run db:stop`.

Use `db:start` for ordinary startup; resetting the database is not part of the daily workflow. These scripts operate on the local stack, which is for development only and must not be exposed publicly.

To apply newly added migrations without resetting existing data, run `npm run db:migrate`.

After changing local service configuration, use `npm run db:stop` followed by `npm run db:start`. The default stop preserves local data; never add `--no-backup`. Authentication is enabled for local API credentials, not for a public login or sign-up feature. `npm run db:status` displays local credentials: keep that output private and use only the anonymous/public key for the dashboard.

The Supabase database is reproducible from committed files:

| Path                       | Responsibility                                          |
| -------------------------- | ------------------------------------------------------- |
| `supabase/config.toml`     | Local service and database configuration                |
| `supabase/migrations/`     | Versioned database schema                               |
| `supabase/seed.sql`        | Six deterministic fictional events and their provenance |
| `supabase/tests/database/` | pgTAP database contract tests                           |

Never commit hosted Supabase credentials, service-role keys, `OPENROUTER.key`, downloaded live data, or `.env` files.

### Optional: rebuild the local fixture database

**Destructive:** `db:reset` deletes this project's local database contents, including any live listings you have collected, and replays migrations plus fictional seed data. Back up data you want to keep first. Run this only when you deliberately want a fresh fixture database:

```bash
npm run db:reset
```

This command does not reset or deploy a hosted Supabase project.

## Data flow

The schema is designed for discovery before normalization:

1. A discovery agent creates a `search_runs` record.
2. Each selected listing is upserted into `event_sources` with its URL, provider identity, model-generated evidence report, and hosted source-fetch metadata.
3. A source may remain unlinked while extraction is incomplete.
4. Normalized sources are linked to canonical `events` records.
5. Only events explicitly marked `published` are readable through the public application role.

The manual review boundary records a private approval snapshot in `event_publication_reviews` and exposes only a selected canonical `public_registration_url` on the event. Publication never happens as a side effect of discovery or a page load.

This preserves the latest source snapshot and its original discovery-run attribution. It does not yet retain every historical fetch; append-only observations can be added when needed. Raw source records and search-run diagnostics are not publicly readable. The main dashboard explicitly excludes seeded events marked `is_fixture = true`.

## Application architecture

| File                       | Responsibility                                                                |
| -------------------------- | ----------------------------------------------------------------------------- |
| `lib/types.ts`             | Original fixture contract and shared categories                               |
| `lib/mock-events.ts`       | Fictional fixtures used only by the sample edition                            |
| `lib/dashboard/`           | Server-only reads, validation, public card contract, and sample adapter       |
| `lib/storage/`             | Backend selection, SQLite schema, and explicit Supabase import                |
| `lib/review/`              | Local operator CLI, evidence review, public preview, and explicit publication |
| `lib/events.ts`            | Deterministic ranking, score bands, and formatting                            |
| `components/EventCard.tsx` | Event presentation                                                            |
| `components/Dashboard.tsx` | Shared dashboard presentation and feed states                                 |
| `app/page.tsx`             | Request-time published event feed                                             |
| `app/sample/page.tsx`      | Separate static fictional edition                                             |
| `supabase/`                | Optional Postgres persistence, provenance, seed data, and database tests      |

The server-only ingestion code lives in `lib/ingestion/`, its manual entry point is `scripts/ingest.ts`, and generated database types live in `lib/database.types.ts`. Ingestion remains separate from the read-only dashboard; page loads never make paid API calls.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:next
npm run test:next:runtime
```

Run `build` before the two production checks. `test:next:runtime` uses only synthetic HTTP responses and temporary local ports; it needs permission to start local servers. The normal suite exercises SQLite with isolated ignored temporary files. The following optional Postgres checks require local Supabase:

```bash
npm run db:test
npm run db:lint
```

The database contract tests expect the fictional seed events. Prefer `npm run db:test:isolated`: it creates a disposable database inside the local Supabase Docker container, applies migrations and seeds, runs contracts, the real review CLI, and concurrency checks, and removes only that disposable database. Do not reset a database containing data you want to keep just to run tests. See the [review checkpoint](docs/REVIEW-PUBLISH-PROGRESS.md) for current verification and local installation limitations.

## Roadmap

| Status                 | Scope                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Completed              | V0 static dashboard; V1 database schema, provenance, fixture seeds, and contract tests                            |
| Live checkpoint passed | OpenRouter discovery, source verification, generalized bounded schema repair, SQLite draft persistence, and tests |
| Next                   | Verify the current draft, then classify recent candidate losses and improve discovery recall                      |
| Implemented and tested | Database-backed dashboard, separate sample edition, unknown-field handling, and loading/empty/error states        |
| Implemented and tested | Local private draft review, public preview, explicit stale-safe publication, and canonical registration links     |
| Implemented and tested | Read-only SQLite quality evaluation with recent-cohort, conversion, compatibility, usage, and cost metrics        |
| Later                  | Structured scoring, additional providers, cross-source deduplication, scheduling, and personalization             |

The database read boundary and dashboard integration are implemented. Local migrations, authentication, and database/API access are verified in the [readiness checkpoint](docs/LOCAL-READINESS.md). Fresh run `edc10f58-32cd-4ab6-9f50-4317358c5139` exercised the generalized JSON repair boundary end to end: one unfamiliar extraction structure became one canonical, scalar-preserving draft with no errors. The draft remains private pending manual comparison with its current Meetup page. Interrupted runs can be listed, previewed, and explicitly closed without deleting their audit history. Real event collection does not depend on finishing AI scoring first.

## Historical development records

The original [V0 walkthrough](docs/archive/V0-WALKTHROUGH.md) and [complete-code snapshot](docs/archive/V0-COMPLETE-CODE.md) are archived records of the browser-based ChatGPT development phase. Their contents are intentionally preserved, including obsolete commands and setup details. Use this README and the actual source files for current development. The formatter skips `docs/archive/` to avoid rewriting those snapshots.
