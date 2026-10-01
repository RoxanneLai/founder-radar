# Career discovery

RightRoom helps career entrants prioritize useful rooms, not predict job offers. New ingestion commands default to the NYC career profile, and the homepage defaults to career ranking. Explicit `--profile founder` retains the original startup search. Historical saved options without a profile still mean founder; no old runs, evidence, scores, or published records are reinterpreted or migrated.

## Start without spending

```bash
npm run ingest -- --limit 3
npm run ingest -- --profile founder --limit 3
```

This prints a free plan. It reads non-secret model and career configuration, but never reads `OPENROUTER.key`, opens a database, contacts a provider, or writes data. Career defaults to the next 30 days; founder defaults to 14. Supply both `--from` and `--to` for an explicit window, bounded to 31 days. Live windows still reject stale starts and already-started events.

`--searches` is a hosted-search budget (career 1–12, founder 1–3); `--limit` separately caps retained candidates at 1–10. Both default to three searches, with the existing default candidate cap of ten. Neither setting promises that many usable drafts. The 12-query plan interleaves three product, three company-technology, three financial-technology, two delivery, and one exploratory-employer family. The first three searches cover different families.

Hosted Exa/OpenRouter searches are model-directed, not dedicated site crawlers. Planned queries are stored as plans, never represented as exact executed queries. Unreported counters, executed queries, usage, and costs stay unknown. Provider-reported billing is diagnostic, not independently verified. Larger search budgets can cost more; the previous three-search pilot budget does not authorize a 12-search live run.

## Configuration and eligibility

`config/career.json` contains a generic computer-science graduate/capital-markets technology background, primary product/technical-product roles, fallback technical project/program roles, preferred domains, a profile version, and weights summing to 100. Override it with `--career-config path`, with or without explicit `--profile career`. Founder mode rejects that flag and does not read career configuration. Explicit `--profile career` remains supported for scripts. Missing or invalid career configuration fails closed before credentials, database access, or network requests. Keep credentials, résumé contact details, and full résumés out of configuration. Update the profile version when changing its meaning; existing stored assessments are not automatically rescored.

Company engineering talks and bank software/platform events qualify when supported product-career or technical-delivery relevance exists. Preferred domains are bonuses, not exclusions. Founders, recruiters, PM speakers, and advertised jobs are not required. Clearly ineligible, cancelled, past, virtual-only, irrelevant, and closed-without-waitlist listings are rejected. Approval-required/waitlisted events and relevant technical prerequisites remain visible caveats. Unknown price, venue, availability, and hiring are not invented. Attendance restrictions require careful human checking.

Career candidates use a separate strict schema: the historical `relevant_to_founders` field stays `null/null`. Every supported fact carries a value and exact contiguous evidence quote; unknowns are `null/null` or empty arrays. Both the prompt and API request contain the complete schema. New live runs capture bounded public listing text privately and use tool-free extraction. Quotes must occur in that candidate's captured page, not another listing or the compressed discovery report. Historical model-report runs still require one uniquely associated report section per candidate and retain their original hosted-fetch compatibility gates. Quotes establish textual grounding, not semantic truth. See [source evidence](SOURCE-EVIDENCE.md): static page text is not a browser render or a guarantee of current availability. Human review remains required.

## Sources and meaningful identity

The existing Meetup, Luma, and Eventbrite individual-listing support remains. `config/event-sources.json` adds conservative verified listing shapes for FINOS (`/hosted-events/slug`), Datadog (`/events/slug`), PMI NYC (`/calendar?eventId=number`), and AICamp (`/event/eventdetails/W` followed by exactly ten digits). Tracking/private parameters are stripped from public links, while distinct PMI `eventId` values and AICamp path IDs remain distinct sources. Calendars without event identity and unsupported hosts/paths cannot become event records.

The shapes were checked against public organizer examples: [FINOS individual event](https://www.finos.org/hosted-events/2025-10-22-open-source-in-finance-forum-nyc), [Datadog event](https://events.datadoghq.com/events/2026-awsgameday-nyc/), and [PMI NYC event](https://pminyc.org/calendar?eventId=45084). These establish URL patterns only, not fresh event evidence.

The AICamp family was verified against two public NYC pages: the [Google Cloud builder lab](https://www.aicamp.ai/event/eventdetails/W2026100514) and [Microsoft/Elastic developer night](https://www.aicamp.ai/event/eventdetails/W2026100714). Only the exact `aicamp.ai` host (with optional `www`) and this ID family are supported, not `events.aicamp.ai`, directories, login pages, other ID formats or nested paths. The optional registry `identity_pattern` accepts only the fixed `W[0-9]{10}` expression and preserves the suffix as the external ID; it is not an arbitrary regular-expression configuration. Dates are extracted from evidence, never inferred from the ID: the Google lab's ID includes `20261005`, but its visible date is October 6. The developer night advertises 5 PM while its agenda starts check-in at 5:30 PM; normal conflict checking and human review remain required. Coding/cloud prerequisites, unknown prices and registration access must be checked independently. Public event text is readable without logging in; RSVP can require an account, and the application does not log in or bypass access controls.

Other named communities (Kosli, ProductTank, Women In Product, Product School, Supermomos, NY Tech Alliance, and Tech:NYC) are discovery targets; their events must resolve to an already supported individual listing. ProductTank's sampled NYC event uses Meetup, and Product School's NYC conference uses Eventbrite, so neither needs a new whole-site allowance. Direct arbitrary organizer URLs are deliberately not accepted. Extending the registry requires verified examples, matching JavaScript and an additive Supabase `public_listing_url` migration, plus parity tests. There is no semantic cross-platform event matching. Adding a source family makes it eligible for model-directed discovery; it does not guarantee a search of that community or any usable drafts.

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

`/` and its compatible `/career` address read only published, non-fixture, upcoming NYC career assessments, excluding closed registration, and rank by career score, then date and stable ID. `/sample/career` is static and fictional, with no database or registration links. `/events` retains the all-published feed and original networking-score ranking; founder-only records are not hidden from that view. Public assessment fields are strictly validated: components, fixed reasons/cautions, confidence, founder applicability, hiring, and version. Raw quotes, research reports, recovery files, and approval history remain private. Unknowns and inferred NYC timezone show caution text.

## Storage, timezone, and review

SQLite initializes/upgrades automatically. Supabase requires the additive `20260929010000_add_career_assessment.sql` and `20260929011000_add_organizer_listing_urls.sql` migrations before using the updated dashboard (including the all-events feed); career ingestion preflights the assessment column before paid research. The explicit Supabase-to-SQLite importer retains the nullable assessment and accepts older snapshots without it. No data is copied or deleted merely by switching backends.

Supabase additionally needs `20261001010000_add_aicamp_listing_urls.sql` for AICamp review/public links. It changes only the listing-URL function, not existing event data, and must be applied deliberately with `npm run db:migrate` when Supabase is selected. SQLite needs no new database schema migration for this URL-family addition. Source-capture limits, exact-quote grounding, eligibility validation, bounded repair and explicit publication approval are unchanged. Offline synthetic AICamp verification does not establish current native-fetch availability or close the fresh career-discovery acceptance gate.

A missing timezone defaults to `America/New_York` only after confirmed physical NYC attendance and a known date/clock time. The event date determines DST; unambiguous UTC instants are preserved. Conflicting explicit zones/offsets, DST gaps, and repeated local times are rejected. The private source fact stays unknown; `normalization_notes` separately records the inference, and review/card cautions request checking. The same rule applies to both profiles and recovery.

Ingestion and recovery only create private drafts. Use the existing [review workflow](REVIEW-PUBLISH.md) before explicit publication. Changed event/source snapshots invalidate review tokens. Fixtures and published/archived events remain protected. A founder-profile refresh of an editable draft clears its career assessment to avoid stale career claims; it does not overwrite legacy score columns.

Next acceptance step: separately approve a small three-search/three-candidate fresh-window career pilot, inspect its drafts and source pages, and calibrate ranking usefulness. Offline tests validate software boundaries, not live model quality. This increment does not add scheduling, automatic publication/registration, New Jersey, a browser inbox, a watchlist, or per-role views.

### AICamp listing checkpoint — October 1, 2026

Narrow AICamp listing support is implemented for both discovery profiles, shared source capture, SQLite review/public links, and the optional Supabase URL validator. Existing organizer and platform rules are unchanged. Synthetic tests cover canonical IDs and exclusions, distinct-ID deduplication, parameter stripping, same-ID redirects, blocked login/cross-ID redirects, capture failure without extraction, repeated SQLite career ingestion, failed-refresh evidence preservation and draft privacy. A synthetic event ID containing 2099 still normalizes the supported 2026 event date, proving that IDs are not date evidence.

Verification passed formatting, lint, type checking, `git diff --check`, and 184 deterministic offline tests (6 unit, 150 ingestion, 17 dashboard, 11 review). Disposable PostgreSQL verification passed six runner tests and 173 pgTAP assertions, including direct JavaScript/SQL AICamp URL parity. A production build, three compiled-page checks and ten runtime checks passed in a credential-free copy under ignored `codex-tmp/`. A free career plan also completed. Only non-fatal npm/workspace warnings were reported.

No paid model calls, live AICamp captures, real-event publication or existing database migrations/changes were made. PostgreSQL verification used a disposable database that was removed afterward; SQLite verification used isolated synthetic databases. The new Supabase migration has not been applied to the normal database. A separately approved fresh career pilot is still required; neither URL support nor synthetic verification guarantees current listing availability or model quality.

### Career-first defaults checkpoint — October 1, 2026

The career homepage, compatible `/career` address, retained `/events` feed, edition-specific loading/retry/sample navigation, and default 30-day career CLI plan are implemented. Explicit founder mode still uses its 14-day default and does not require career configuration. The default three-search budget, paid opt-in, candidate cap, validation, backend selection, and historical missing-profile meaning remain unchanged.

Verification passed formatting, lint, TypeScript, `git diff --check`, and 179 deterministic offline tests (6 unit, 145 ingestion, 17 dashboard, 11 review). A production build, 3 compiled-page checks, and 10 runtime checks passed in a fresh credential-free copy under ignored `codex-tmp/`. Runtime checks cover career homepage/alias ranking and privacy, broader-feed access, edition-specific navigation and streaming, and a freshly initialized temporary SQLite database without Supabase configuration. Only non-fatal npm/workspace warnings were reported.

No paid requests, existing database changes, real-event publication, commits, or pushes were made for this increment. Optional real PostgreSQL integration was not rerun: this change introduces no database schema or query changes. These checks do not close the fresh unassisted career-discovery acceptance gate.

### First career pilot — September 29, 2026

Run `0fb722f5-4a92-4ea0-8a85-47a9228cd22a` completed partially with two discovered sources, no event drafts, and three model requests. The provider-reported total cost was $0.0327572 (unverified billing). FINOS failed a registration value/quote consistency check; Datadog was rejected as insufficient evidence. Independent inspection found that the [FINOS listing](https://www.finos.org/hosted-events/2026-10-08-cdm-nyc-seminar-2026) states October 8, 2026 in NYC, while [Datadog Live](https://events.datadoghq.com/events/datadog-live-newyork/) explicitly states October 22, 2025, not the 2026 year in research. The FINOS page also distinguishes a 3 PM advertised main start from earlier optional agenda activities, which needs human checking. Neither lead was published; the live career acceptance gate remains open.

The offline follow-up clarifies unknown registration as null/null, requires explicit event-year checks rather than footer/window assumptions, rejects recognizable contradictory date years locally, and retains bounded canonical failed-candidate fields privately in run metadata. It does not weaken validation or allow the repair agent to invent evidence, and it cannot reconstruct this pilot's unretained candidate. No paid retry is part of the follow-up. See [failure diagnostics and evidence limitations](INGESTION.md#evidence-is-not-a-page-archive).

Follow-up verification passed formatting, lint, type checking, `git diff --check`, and 141 deterministic offline tests (6 unit, 108 ingestion, 17 dashboard, 10 review). The production build and 11 compiled-page/runtime checks passed in a credential-free isolated source copy under ignored `codex-tmp/`; its nested-workspace warning was non-fatal. SQLite verification used temporary synthetic databases; Supabase metadata persistence was checked through the mocked SDK, without rerunning the optional PostgreSQL suite. No paid calls, existing database changes, or real-event publication were made during the follow-up.

### Second career pilot — September 29, 2026

Run `2585c355-1830-402d-8e7f-3a74c210afcc` completed partially: one existing FINOS source was updated, no event drafts were written, and the source remained unlinked. Its two requests reported $0.02963517 combined cost (unverified billing). Extraction stopped with `invalid_extraction_json` before candidate validation or repair; no third model request was made. The 9,858-character completion, HTTP 200, and normal finish reason do not reveal whether the response contained fences, prose, or malformed JSON. Its text was not retained, so the specific cause cannot be reconstructed.

The offline follow-up adds bounded, content-free formatting diagnostics at the strict JSON parsing boundary for extraction and repair, including persisted safe run summaries and offline replay reports. It does not accept new formats, weaken validation, or make additional model calls. See [safe structured-output diagnostics](INGESTION.md#safe-structured-output-diagnostics). No paid retry or real database change is part of this follow-up; the live career acceptance gate remains open.

Diagnostic follow-up verification passed `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, and `git diff --check`: 150 deterministic offline tests (6 unit, 117 ingestion, 17 dashboard, 10 review). The production build and 11 compiled-page/runtime checks passed in a fresh credential-free source copy under ignored `codex-tmp/`, with only the non-fatal nested-workspace warning. Regression coverage includes malformed extraction and repair JSON, fenced/mixed text, bounded structural hints, private-content exclusion, recovery checkpoint retention, and read-only offline replay against temporary synthetic SQLite data. No paid requests, existing database changes, publication, commits, or pushes were performed for this diagnostic follow-up.

## Implementation verification — September 29, 2026

- `npm run format`, `npm run lint`, `npm run typecheck`, and `git diff --check` passed.
- `npm test` passed 137 deterministic offline tests (6 unit, 104 ingestion, 17 dashboard, 10 review), including career schema isolation, quote grounding, timezone transitions, failed-repair siblings, safe diagnostics, migrations/import, public projections, and recovery rollback/history/conflict checks.
- `npm run db:test:isolated` passed five PostgreSQL runner tests and 162 pgTAP assertions, including 17 new career/organizer checks. It created and removed a disposable database only; the normal Supabase database was unchanged.
- `npm run build`, `npm run test:next` (three compiled-page checks), and `npm run test:next:runtime` (eight runtime checks) passed in a fresh credential-free source copy under ignored `codex-tmp/`, avoiding the working checkout's old build-directory permissions. The nested-copy lockfile warning was non-fatal.
- A free three-search/three-candidate career plan was saved owner-only to ignored `codex-tmp/career-plan.json`. It records the explicit window, diversified planned queries, model/effort, and no writes/paid calls. No key or database was read for the plan.
- The fictional career page and its component/caution layout were inspected in the app browser. The temporary isolated preview was stopped after checking it; no real dashboard data was accessed.

No paid calls, real-event publication, real database migration/import, commits, or pushes were performed for this increment. The existing local rebrand commit is retained beneath this feature branch. This checkpoint is software verification, not a successful live career discovery claim.
