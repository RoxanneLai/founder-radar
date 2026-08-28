# FounderRadar

**Don’t show me every startup event. Show me the ones worth attending.**

FounderRadar explores how an AI event scout could turn fragmented NYC startup listings into a short, explainable list of rooms worth being in.

## Current milestone: V0

A static product prototype with six **fictional** NYC startup events. Includes deterministic networking-score ranking, category tags, founder/investor/networking scores, sample registration urgency, recommendation explanations, optional downsides, source labels, prices, venues, and New York time formatting.

**Not implemented:** real discovery, model calls, database storage, deduplication, personalization, authentication, save/dismiss, email, or scheduled jobs. No keys or accounts are needed for V0. Scores, availability, hosts, venues, and event details are illustrative, not verified claims. Dates are fixed at September 1–6, 2026; this is a sample edition, not a rolling live feed.

## Start here

See [the complete V0 walkthrough](docs/V0-WALKTHROUGH.md) for setup from an empty folder, exact file changes, commands, verification, and the first meaningful commit. See [complete application source](docs/V0-COMPLETE-CODE.md) for full copyable file contents.

### Run this source

Use Node.js 24 LTS (the project requires Node >=22.13 for its Node-based TypeScript tests), npm, and Git.

```bash
npm ci
npm run dev:next
```

Open http://localhost:3000. Both the Work checkout and the portable download include a lockfile; use `npm ci` to install the locked dependencies.

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build:next
npm run test:next
npm run start:next
```

The final command serves the production Next.js build at http://localhost:3000. Stop the development server first so the port is free.

## Architecture

| File                        | Responsibility                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `lib/types.ts`              | The typed `StartupEvent` contract and constrained categories/statuses |
| `lib/mock-events.ts`        | Explicitly fictional fixtures; intentionally not pre-sorted           |
| `lib/events.ts`             | Pure deterministic sorting, score bands, date and price formatting    |
| `components/ScoreBadge.tsx` | Reusable labeled score presentation                                   |
| `components/EventCard.tsx`  | A single event, recommendation, tradeoff, and details                 |
| `app/page.tsx`              | Composes and ranks the shortlist; derives summary counts              |
| `app/layout.tsx`            | Page metadata, root layout, and global styles                         |
| `app/globals.css`           | Tailwind and responsive FounderRadar visual design                    |
| `tests/events.test.mjs`     | Ranking, date, currency, and fixture-contract checks                  |
| `tests/next-html.test.mjs`  | Checks the HTML emitted by the standard Next.js build                 |

The homepage and cards are server components. V0 needs no client state, provider adapters, or API routes. Readonly fixtures discourage mutation; ranking returns a new array. Ties sort by start time, then ID. Scores are independent hand-authored signals, **not an average** and not model output. Fixed date offsets plus `America/New_York` formatting avoid changing displayed times with the viewer’s location. No real registration links are attached to fictional events.

This is a single-user product prototype, not a user-specific recommendation system. Do not describe V0 as an operational AI pipeline in a portfolio.

## Work hosting vs. standard Next.js

The Work checkout retains its Vinext/Cloudflare hosting starter and build scripts. `npm run dev` and `npm run build` in that checkout are Work hosting commands. `dev:next`, `build:next`, and `start:next` use **actual Next.js** with the same app code. The portable ZIP uses standard Next.js for its default commands and omits Work infrastructure and unused UI catalog code.

`tsconfig.json` checks app, components, hooks, and library source; it does not treat hosting-only Worker/D1 examples as Next.js application modules. Work build validation handles the hosting bundle. No D1 or Supabase binding is enabled or used by V0. The `vendor/` CSS file and `tw-animate-css` import come from the Work starter and are retained so the exact same stylesheet is portable; they add no product features.

For a later Vercel deployment of the Work checkout, select the Next.js preset, set build command to `npm run build:next`, and use `.next` as the Next.js output. The portable source uses normal Next.js defaults. No Vercel deployment has been performed in this phase.

## Quality checks

- Unit tests cover nonmutating ranking, deterministic ties, IDs and score ranges, free/paid prices, and New York daylight saving time.
- Shared HTML assertions verify card count and order, metadata, urgency states, optional downsides, mock labeling, and absence of real registration links.
- CI runs lint, application type checking, unit tests, a standard Next.js build, and the Next.js HTML check.
- Responsive breakpoints, readable score labels, semantic headings, and a keyboard skip link are implemented. Browser-based visual/accessibility testing is a separate manual acceptance step; do not equate HTML checks with a browser audit.

## Roadmap — future work, not implemented

| Version | Scope                                                                          |
| ------- | ------------------------------------------------------------------------------ |
| V1      | Supabase/Postgres: canonical `events`, separate `event_sources`, `search_runs` |
| V2      | Structured LLM scoring and explanations                                        |
| V3      | Structured extraction from messy page content                                  |
| V4      | Swappable discovery adapters and search providers                              |
| V5      | Deterministic deduplication; LLM comparison only for uncertain matches         |
| V6      | Daily discovery pipeline and digest generation                                 |
| V7      | Personal preferences and recommendation relevance                              |
| V8      | Feedback, evaluation data, prompt regression tests, and product metrics        |

Use deterministic software for deterministic problems and LLMs for semantic problems. Prompts will live in separate files when those phases begin. **Stop at V0 until it works and the product experience is accepted.**
