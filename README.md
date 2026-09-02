# FounderRadar

**Don’t show me every startup event. Show me the ones worth attending.**

FounderRadar is becoming an event intelligence pipeline for finding and explaining the NYC startup events most worth attending.

## Current milestone: V1 ingestion implementation

V0 is complete: the repository contains a working static Next.js prototype with six fictional events and deterministic ranking. V1 now has a local Postgres foundation and a bounded, manually triggered ingestion agent. The agent implementation is tested offline; paid live-data verification is still pending.

The browser at `http://localhost:3000` still renders the V0 fixtures from `lib/mock-events.ts`. The database schema and seed data are intentionally being established before the UI is connected to Supabase.

See [the ingestion guide](docs/INGESTION.md) for safe startup, limits, and the live acceptance check. The [V1 plan](docs/V1-PLAN.md) describes the wider milestone, and [build progress](docs/INGESTION-PROGRESS.md) records the overnight handoff.

### Preview an ingestion run without spending money

```bash
npm run ingest -- --limit 3
```

After installing dependencies, this prints a plan only: no API requests and no database writes. Live mode requires explicit opt-in, server-side credentials, an API model choice, and a separately approved testing budget. See the ingestion guide before enabling it.

## Run the web application

Use Node.js 24 LTS and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

## Run the local database

Local Supabase requires a Docker-compatible container runtime. Start your runtime (Docker Desktop has been verified for this project), then start the local stack:

```bash
npm run db:start
```

Supabase Studio runs at http://localhost:54323. Stop the local stack with `npm run db:stop`.

Use `db:start` for ordinary startup; resetting the database is not part of the daily workflow. These scripts operate on the local stack, which is for development only and must not be exposed publicly.

To apply newly added migrations without resetting existing data, run `npm run db:migrate`.

The database is reproducible from committed files:

| Path                       | Responsibility                                          |
| -------------------------- | ------------------------------------------------------- |
| `supabase/config.toml`     | Local service and database configuration                |
| `supabase/migrations/`     | Versioned database schema                               |
| `supabase/seed.sql`        | Six deterministic fictional events and their provenance |
| `supabase/tests/database/` | pgTAP database contract tests                           |

Never commit hosted Supabase credentials, service-role keys, downloaded live data, or `.env` files.

### Optional: rebuild the local fixture database

**Destructive:** `db:reset` deletes this project's local database contents, including any live listings you have collected, and replays migrations plus fictional seed data. Back up data you want to keep first. Run this only when you deliberately want a fresh fixture database:

```bash
npm run db:reset
```

This command does not reset or deploy a hosted Supabase project.

## Data flow

The schema is designed for discovery before normalization:

1. A discovery agent creates a `search_runs` record.
2. Each fetched listing is upserted into `event_sources` with its URL, provider identity, fetched content, and raw payload.
3. A source may remain unlinked while extraction is incomplete.
4. Normalized sources are linked to canonical `events` records.
5. Only events explicitly marked `published` are readable through the public application role.

This preserves the latest source snapshot and its original discovery-run attribution. It does not yet retain every historical fetch; append-only observations can be added when needed. Raw source records and search-run diagnostics are not publicly readable. Seeded events carry `is_fixture = true`, so a future live feed can explicitly exclude them.

## Application architecture

| File                       | Responsibility                                            |
| -------------------------- | --------------------------------------------------------- |
| `lib/types.ts`             | Current V0 UI event contract                              |
| `lib/mock-events.ts`       | Fictional fixtures used by the current page               |
| `lib/events.ts`            | Deterministic ranking, score bands, and formatting        |
| `components/EventCard.tsx` | Event presentation                                        |
| `app/page.tsx`             | Current server-rendered shortlist                         |
| `supabase/`                | V1 persistence, provenance, seed data, and database tests |

The server-only ingestion code lives in `lib/ingestion/`, its manual entry point is `scripts/ingest.ts`, and generated database types live in `lib/database.types.ts`. The current UI remains a static prototype until a later increment connects it to persisted events.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:next
```

`test:next` reads the production output, so run `build` first. Database checks require the local Supabase stack.

```bash
npm run db:test
npm run db:lint
```

The database contract tests expect the fictional seed events. Prefer `npm run db:test:isolated`: it creates a disposable database inside the local Supabase Docker container, applies migrations and seeds, runs the contracts and a concurrency test, and removes only that disposable database. Do not reset a database containing data you want to keep just to run tests. See the [build checkpoint](docs/INGESTION-PROGRESS.md) for current verification and local installation limitations.

## Roadmap

| Status                    | Scope                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Completed                 | V0 static dashboard; V1 database schema, provenance, fixture seeds, and contract tests                                          |
| Built; live check pending | Manually triggered OpenAI web-search ingestion, source evidence, draft-only atomic persistence, and offline/database tests      |
| Next                      | Approve a small API budget and verify three real listings plus a repeat run                                                     |
| Next                      | Connect the dashboard to persisted events, clearly separate fixtures from live listings, and support unknown or unscored fields |
| Later                     | Structured scoring, additional providers, cross-source deduplication, scheduling, personalization, and evaluation               |

The database foundation is implemented; the full V1 application milestone is not complete until the UI reads from Postgres. Real event collection does not depend on finishing AI scoring first.

## Historical development records

The original [V0 walkthrough](docs/archive/V0-WALKTHROUGH.md) and [complete-code snapshot](docs/archive/V0-COMPLETE-CODE.md) are archived records of the browser-based ChatGPT development phase. Their contents are intentionally preserved, including obsolete commands and setup details. Use this README and the actual source files for current development. The formatter skips `docs/archive/` to avoid rewriting those snapshots.
