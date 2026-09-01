# FounderRadar

**Don’t show me every startup event. Show me the ones worth attending.**

FounderRadar is becoming an event intelligence pipeline for finding and explaining the NYC startup events most worth attending.

## Current milestone: V1 data foundation

V0 is complete: the repository contains a working static Next.js prototype with six fictional events and deterministic ranking. V1 adds the local Postgres foundation that a future discovery agent will write to.

The browser at `http://localhost:3000` still renders the V0 fixtures from `lib/mock-events.ts`. The database schema and seed data are intentionally being established before the UI is connected to Supabase.

See [the V1 plan](docs/V1-PLAN.md) for the data flow, schema decisions, completion criteria, and the next agent-focused increment.

## Run the web application

Use Node.js 24 LTS and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

## Run the local database

Local Supabase requires a Docker-compatible container runtime. Start Docker Desktop, OrbStack, Rancher Desktop, or Podman before running these commands.

```bash
npm run db:start
npm run db:reset
npm run db:test
npm run db:lint
```

Supabase Studio runs at http://localhost:54323. Stop the local stack with `npm run db:stop`.

`db:reset` deletes this project's local database contents and replays migrations plus fictional seed data. Back up any live data you want to keep before resetting. These scripts do not reset or deploy a hosted Supabase project. The local stack is for development only; do not expose it publicly.

The database is reproducible from committed files:

| Path                       | Responsibility                                          |
| -------------------------- | ------------------------------------------------------- |
| `supabase/config.toml`     | Local service and database configuration                |
| `supabase/migrations/`     | Versioned database schema                               |
| `supabase/seed.sql`        | Six deterministic fictional events and their provenance |
| `supabase/tests/database/` | pgTAP database contract tests                           |

Never commit hosted Supabase credentials, service-role keys, downloaded live data, or `.env` files.

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

The current UI remains a static prototype until a later V1 increment introduces a server-side repository and generated database types.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:next
```

`test:next` reads the production output, so run `build` first. Database checks require the local Supabase stack.

## Roadmap

The next product priority is a small, manually triggered live-data agent: one provider, a bounded search, and real listings persisted with provenance. The original version labels below describe feature areas, not a requirement to finish AI scoring before fetching real events.

| Version | Scope                                                                       |
| ------- | --------------------------------------------------------------------------- |
| V0      | Completed static product prototype with fictional fixtures                  |
| V1      | Supabase/Postgres persistence, provenance, and UI data access               |
| V2      | Structured scoring and explanations                                         |
| V3      | Structured extraction from messy page content                               |
| V4      | Swappable discovery adapters and search providers                           |
| V5      | Deterministic deduplication; semantic comparison only for uncertain matches |
| V6      | Scheduled discovery pipeline and digest generation                          |
| V7      | Personal preferences and recommendation relevance                           |
| V8      | Feedback, evaluation data, regression tests, and product metrics            |

The original [V0 walkthrough](docs/V0-WALKTHROUGH.md) and [complete-code snapshot](docs/V0-COMPLETE-CODE.md) are retained only as historical records of the browser-based ChatGPT development phase. They are not current setup instructions or authoritative copies of the code.
