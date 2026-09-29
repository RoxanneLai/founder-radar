# Career discovery

RightRoom helps career entrants prioritize useful rooms, not predict job offers. This increment adds an opt-in NYC career profile; the default founder profile and historical founder-audience relevance remain unchanged.

## Start without spending

```bash
npm run ingest -- --profile career --searches 3 --limit 3
```

This prints a free plan. It reads non-secret model and career configuration, but never reads `OPENROUTER.key`, opens a database, contacts a provider, or writes data. Career defaults to the next 30 days; founder defaults to 14. Supply both `--from` and `--to` for an explicit window, bounded to 31 days. Live windows still reject stale starts and already-started events.

`--searches` is a hosted-search budget (career 1–12, founder 1–3); `--limit` separately caps retained candidates at 1–10. Both default to three searches, with the existing default candidate cap of ten. Neither setting promises that many usable drafts. The 12-query plan interleaves three product, three company-technology, three financial-technology, two delivery, and one exploratory-employer family. The first three searches cover different families.

Hosted Exa/OpenRouter searches are model-directed, not dedicated site crawlers. Planned queries are stored as plans, never represented as exact executed queries. Unreported counters, executed queries, usage, and costs stay unknown. Provider-reported billing is diagnostic, not independently verified. Larger search budgets can cost more; the previous three-search pilot budget does not authorize a 12-search live run.

## Configuration and eligibility

`config/career.json` contains a generic computer-science graduate/capital-markets technology background, primary product/technical-product roles, fallback technical project/program roles, preferred domains, a profile version, and weights summing to 100. Override it with `--career-config path`. Keep credentials, résumé contact details, and full résumés out of configuration. Update the profile version when changing its meaning; existing stored assessments are not automatically rescored.

Company engineering talks and bank software/platform events qualify when supported product-career or technical-delivery relevance exists. Preferred domains are bonuses, not exclusions. Founders, recruiters, PM speakers, and advertised jobs are not required. Clearly ineligible, cancelled, past, virtual-only, irrelevant, and closed-without-waitlist listings are rejected. Approval-required/waitlisted events and relevant technical prerequisites remain visible caveats. Unknown price, venue, availability, and hiring are not invented. Attendance restrictions require careful human checking.

Career candidates use a separate strict schema: the historical `relevant_to_founders` field stays `null/null`. Every supported fact carries a value and exact contiguous evidence quote; unknowns are `null/null` or empty arrays. Both the prompt and API request contain the complete schema. Multi-event reports require one uniquely associated source section per candidate; cross-event evidence cannot establish eligibility. Quotes establish textual grounding, not semantic truth. The hosted fetch confirms the report through the model; the application does not retain an independent page archive.

## Sources and meaningful identity

The existing Meetup, Luma, and Eventbrite individual-listing support remains. `config/event-sources.json` adds conservative verified listing shapes for FINOS (`/hosted-events/slug`), Datadog (`/events/slug`), and PMI NYC (`/calendar?eventId=number`). Tracking/private parameters are stripped from public links, while distinct PMI `eventId` values remain distinct sources. Calendars without event identity and unsupported hosts/paths cannot become event records.

The shapes were checked against public organizer examples: [FINOS individual event](https://www.finos.org/hosted-events/2025-10-22-open-source-in-finance-forum-nyc), [Datadog event](https://events.datadoghq.com/events/2026-awsgameday-nyc/), and [PMI NYC event](https://pminyc.org/calendar?eventId=45084). These establish URL patterns only, not fresh event evidence.

Other named communities (Kosli, AICamp, ProductTank, Women In Product, Product School, Supermomos, NY Tech Alliance, and Tech:NYC) are discovery targets; their events must resolve to an already supported individual listing. Direct arbitrary organizer URLs are deliberately not accepted yet. Extending the registry requires verified examples, matching JavaScript and an additive Supabase `public_listing_url` migration, plus parity tests. There is no semantic cross-platform event matching.

## Scores and public display

`career-score-v1` separates usefulness from evidence confidence:

| Component        | Weight | Initial supported-evidence rule                                                                                                |
| ---------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------ |
| Role fit         |     30 | Direct product 100%, adjacent product 75%, direct fallback delivery 50%, adjacent delivery 25%                                 |
| Relevant people  |     25 | Named relevant employees or connected named startup founders scheduled to participate; sponsors/venue logos alone do not count |
| Interaction      |     20 | Networking/collaboration 100%, Q&A 50%, presentation alone no conversation bonus                                               |
| Domain fit       |     15 | Exact configured domain match; unfamiliar domains may still qualify                                                            |
| Practical access |     10 | Equal quarters for explicit eligibility, known venue, registration availability, and explicit free admission with currency     |

Paid events may qualify. Unknown dimensions earn no unsupported bonus and have caveats. `founderAccess` is applicable only for named actual startup founders with connected company/role/participation evidence, unknown for insufficient startup evidence, and not applicable to other-company/community events. Founder absence carries no penalty. Scheduled participation does not guarantee attendance or direct conversation; a keynote earns only its supported interaction credit. Human review must distinguish community organizers from actual startups and verify semantic relevance.

`/career` reads only published, non-fixture, upcoming NYC career assessments and ranks by career score, then date and stable ID. `/sample/career` is static and fictional, with no database or registration links. `/` remains the all-published feed. Public assessment fields are strictly validated: components, fixed reasons/cautions, confidence, founder applicability, hiring, and version. Raw quotes, research reports, recovery files, and approval history remain private. Unknowns and inferred NYC timezone show caution text.

## Storage, timezone, and review

SQLite initializes/upgrades automatically. Supabase requires the additive `20260929010000_add_career_assessment.sql` and `20260929011000_add_organizer_listing_urls.sql` migrations before using the updated dashboard (including the all-events feed); career ingestion preflights the assessment column before paid research. The explicit Supabase-to-SQLite importer retains the nullable assessment and accepts older snapshots without it. No data is copied or deleted merely by switching backends.

A missing timezone defaults to `America/New_York` only after confirmed physical NYC attendance and a known date/clock time. The event date determines DST; unambiguous UTC instants are preserved. Conflicting explicit zones/offsets, DST gaps, and repeated local times are rejected. The private source fact stays unknown; `normalization_notes` separately records the inference, and review/card cautions request checking. The same rule applies to both profiles and recovery.

Ingestion and recovery only create private drafts. Use the existing [review workflow](REVIEW-PUBLISH.md) before explicit publication. Changed event/source snapshots invalidate review tokens. Fixtures and published/archived events remain protected. A founder-profile refresh of an editable draft clears its career assessment to avoid stale career claims; it does not overwrite legacy score columns.

Next acceptance step: separately approve a small three-search/three-candidate fresh-window career pilot, inspect its drafts and source pages, and calibrate ranking usefulness. Offline tests validate software boundaries, not live model quality. This increment does not add scheduling, automatic publication/registration, New Jersey, a browser inbox, a watchlist, or per-role views.

## Implementation verification — September 29, 2026

- `npm run format`, `npm run lint`, `npm run typecheck`, and `git diff --check` passed.
- `npm test` passed 137 deterministic offline tests (6 unit, 104 ingestion, 17 dashboard, 10 review), including career schema isolation, quote grounding, timezone transitions, failed-repair siblings, safe diagnostics, migrations/import, public projections, and recovery rollback/history/conflict checks.
- `npm run db:test:isolated` passed five PostgreSQL runner tests and 162 pgTAP assertions, including 17 new career/organizer checks. It created and removed a disposable database only; the normal Supabase database was unchanged.
- `npm run build`, `npm run test:next` (three compiled-page checks), and `npm run test:next:runtime` (eight runtime checks) passed in a fresh credential-free source copy under ignored `codex-tmp/`, avoiding the working checkout's old build-directory permissions. The nested-copy lockfile warning was non-fatal.
- A free three-search/three-candidate career plan was saved owner-only to ignored `codex-tmp/career-plan.json`. It records the explicit window, diversified planned queries, model/effort, and no writes/paid calls. No key or database was read for the plan.
- The fictional career page and its component/caution layout were inspected in the app browser. The temporary isolated preview was stopped after checking it; no real dashboard data was accessed.

No paid calls, real-event publication, real database migration/import, commits, or pushes were performed for this increment. The existing local rebrand commit is retained beneath this feature branch. This checkpoint is software verification, not a successful live career discovery claim.
