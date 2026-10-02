# Saved career discovery diversity audit

## Decision summary — October 1, 2026

The next useful change is an explicit **expansion mode**, separate from the existing refresh behavior. The current pipeline does not exclude already-known events: it excludes recently cancelled, unlinked sources only. Repeated eligible FINOS and Meetup results are therefore permitted, not evidence that URL deduplication is broken. Avoid increasing paid search budgets or adding another parsing agent to solve this particular problem.

This is a read-only audit of the local imported SQLite database at code revision `a5cf35b`. No provider or source requests, credential reads, database changes, publication, run cleanup, commits or pushes were made. Detailed projected counters are saved owner-only under ignored `codex-tmp/`; raw research, quotes, prompts, headers and reasoning traces are not included in the audit export. This document contains aggregated findings, not private source snapshots.

## What the saved history establishes

The database contains 52 saved runs: 11 explicitly career and 41 historical missing-profile/founder runs. Historical founder runs were not relabelled as career. Seven career runs have final statuses; four are still recorded as running, with no retained research/summary checkpoint. Their costs, outcomes and process status are unknown, so they are excluded from completed-run statistics and have not been closed.

Across the seven finalized career runs:

- 12 retained source selections represent four unique listing identities; eight selections (66.7%) repeat a listing selected in an earlier saved career run.
- Four source rows were created and eight observations updated existing sources. There was one ingestion event write. This is not the total number of manually recovered or published career events.
- No run filled its three-candidate cap; each selected one or two sources. A candidate cap is a maximum, not a promise of three viable events.
- All seven recorded the same three planned families: product, company technology and financial technology. All report 15 citations, but exact executed queries and search-tool counts are unavailable. These counts do not prove three searches ran, 15 different listings were examined, or a particular community was searched.
- Each recorded one cancellation exclusion; no retained selection overlapped its exclusion set. This verifies observed exclusion outcomes, not every raw search result returned by the provider.
- Six runs were partial; the latest succeeded. The 16 recorded model requests report $0.20133504 combined diagnostic cost. Billing is unverified and excludes unknown costs of unfinished attempts; this mixed historical cohort is not a production cost-per-event estimate.

Times below are New York local time (EDT). “First selected” means first appearance in this saved career cohort, not necessarily new to all historical data.

| Run prefix | Started          | Window  | Selected | First selected / repeated | Event writes | Outcome                                         |
| ---------- | ---------------- | ------- | -------: | ------------------------: | -----------: | ----------------------------------------------- |
| `0fb722f5` | Sep 29, 5:57 PM  | 30 days |        2 |                     2 / 0 |            0 | Invalid candidate; insufficient source evidence |
| `2585c355` | Sep 29, 6:54 PM  | 30 days |        1 |                     0 / 1 |            0 | Invalid extraction JSON                         |
| `a91843ab` | Sep 29, 8:31 PM  | 14 days |        2 |                     1 / 1 |            0 | Insufficient evidence; hosted fetch failure     |
| `16da2635` | Sep 29, 10:24 PM | 14 days |        1 |                     0 / 1 |            0 | Unsupported format label                        |
| `46a51446` | Sep 30, 11:40 PM | 14 days |        2 |                     1 / 1 |            0 | Capture redirect limit; invalid timezone        |
| `21903e62` | Oct 1, 4:16 PM   | 14 days |        2 |                     0 / 2 |            0 | Capture redirect limit; invalid timezone        |
| `1fea9bd8` | Oct 1, 7:27 PM   | 14 days |        2 |                     0 / 2 |            1 | Succeeded, without repair                       |

## Listing concentration and failures

| Retained listing identity                | Selected in completed runs | Current linkage, not historical outcome                |
| ---------------------------------------- | -------------------------: | ------------------------------------------------------ |
| FINOS, CDM NYC seminar                   |                        7/7 | Linked to the protected published event                |
| Meetup, Supabase x Grafana & Friends NYC |                        3/7 | Linked to the new private draft                        |
| Datadog Live New York                    |                        1/7 | Unlinked; latest stored error is insufficient evidence |
| Luma, shortlist fireside                 |                        1/7 | Unlinked; latest stored error is hosted fetch failure  |

No retained PMI NYC, AICamp or Eventbrite listing appears in this career cohort. This does not establish that these sources were never searched or that their retrieval is broken. Other report/background/citation URLs are not counted as retained event selections.

Three early runs used historical report/hosted-fetch evidence. Four later runs used local page capture, with seven recorded capture attempts: five captured and two failed with the redirect-limit code. The latest run captured both FINOS and Meetup and produced two canonical, schema-valid, source-matched candidates without repair. Earlier format/timezone and redirect failures have tested compatibility fixes; the latest success shows those two listings now pass the full capture-to-validation path, not that all source families work.

The earlier [career checkpoint](CAREER-EVENTS.md#first-career-pilot--september-29-2026) independently flagged the Datadog listing's past 2025 date. That is a historical observation, not a new retrieval in this audit. The Luma hosted-fetch failure cannot establish current local-capture availability; neither unlinked lead should be silently reclassified or permanently suppressed solely because of an old failure.

## Code findings

1. [The orchestrator](../lib/ingestion/run.ts) requests up to 50 cancelled-source exclusions from the preceding 90 days, passes them to research, and filters returned selections again locally. [SQLite](../lib/ingestion/sqlite-repository.ts) and [Supabase](../lib/ingestion/repository.ts) use equivalent predicates: unlinked source, `source_page_cancelled`, and recent last attempt. Successful, published, draft-linked, past or merely previously seen listings are not part of this exclusion query.
2. [Identity selection](../lib/ingestion/sources.ts) removes aliases, duplicates and excluded identities before applying the limit, using canonical URLs and platform external IDs. [Transactional storage](../lib/ingestion/sqlite-repository.ts) upserts existing sources and protects published/archived/fixture events. Across-run reuse is refresh, not insertion of duplicate source rows. Semantic cross-platform event matching remains out of scope.
3. [The provider](../lib/ingestion/openrouter-provider.ts) accepts supported, cited listing URLs actually present in the research report. Numbered event sections retain the first supported cited identity per section. This deliberately avoids treating secondary RSVP/background links as separate events; it is not evidence of lost independent events in these runs. Raw provider search-result lists are not retained, so the pre-selection funnel cannot be reconstructed precisely.
4. Planned query families and the search budget are passed to model-directed research. There is no per-community crawler or observed family-coverage guarantee. The existing inspector/evaluator already provide safe run inspection; a second broad reporting framework is unnecessary for this finding.

## Recommended next implementation, requiring separate approval

Add a narrowly scoped, opt-in expansion intent while leaving existing refresh behavior as the default:

- During live preflight, collect supported source identities linked to non-fixture events in the requested event window, combine with cancelled-source exclusions, and apply the same canonical/external-ID checks before model research and before capture. Keep this bounded and preserve priority for the existing cancellation set; adding known events must not displace those exclusions. Record exclusion counts and whether the known-event set exceeded the cap rather than claiming every known listing was excluded.
- Preserve refresh mode so operators can deliberately recheck known events and revisit failed leads after compatibility fixes. Do not blanket-ban unlinked failures or transfer/delete existing data. Expansion prioritizes events not already linked; it cannot guarantee a previously unseen source or a distinct cross-platform event.
- Expose the effective intent and safe exclusion counts in plans/run metadata. Free plans must describe the policy without opening the database, reading credentials, computing the live exclusion set, or making requests. Keep private URL sets out of console diagnostics.
- Implement equivalent read-only selection in both repositories. Preserve the current cancellation policy, failed-refresh evidence, review/publication protection and unchanged request/search/repair bounds. No automatic retry or follow-up paid search when exclusions leave zero candidates.
- Test synthetic linked drafts, published/fixture records, window boundaries, alias/external-ID exclusions, failed unlinked leads, bounded/truncated sets, database-read failure before paid research, and free plans. Do not introduce tests dependent on live model quality.

Only after offline verification should a separately approved, one-attempt three-search/three-candidate expansion pilot test whether retained coverage increases. Zero new candidates is a valid result, not permission to retry, enlarge the budget, or weaken validation. Consider query rotation or verified new URL families only after measuring this smaller change.

## Verification and limitations

The scratch audit opened SQLite explicitly read-only, without automatic initialization or migrations, and read the cohort in one consistent transaction. Independent direct SQL reproduced the seven finalized runs, 12 selections, four creations, eight updates, one write and listing frequencies. All 39 focused existing offline tests passed across validation, orchestration, repository, SQLite and AICamp suites. Formatting and Git whitespace checks passed. Production builds, lint, TypeScript and real PostgreSQL integration were not rerun because this increment changes documentation only.

The windows, prompts, capture path and validation changed during these historical runs; they are not a controlled model comparison. Current source rows can overwrite earlier evidence/error/linkage, so historical findings use saved run summaries and capture diagnostics instead. The four still-running records require process confirmation and a separately approved recovery operation, not cleanup during this read-only audit. No claim is made about live search exhaustiveness, missing model usage, current RSVP availability or overall production unit economics.
