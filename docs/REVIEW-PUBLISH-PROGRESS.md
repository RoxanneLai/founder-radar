# Draft-review and publishing checkpoint

## Approved scope and safeguards

The scheduled cycle started September 2, 2026 at 2:10 AM America/New_York. Scope: a local review workflow, private evidence inspection, public-data preview, explicit publication approval, validated public listing links, and synthetic-data verification. Stop by 8 AM, on a genuine blocker, or at 10% or less remaining in either Codex usage window. No paid API calls, purchases, resets, commits, pushes, deployments, real event publication, or changes to the normal database are authorized.

## Implementation

- `npm run review` provides offline help; `list`, `inspect`, and `preview` use read-only local transactions.
- Explicit source selection determines a canonical public listing link; query parameters/fragments stay private.
- Publication requires a reviewed revision token and explicit `--approve`. Event and evidence changes invalidate approval.
- A transactional publisher checks draft eligibility, source evidence, link safety, and the current NYC feed window; records a private approval snapshot; then publishes atomically.
- Public cards use only the new public link field. Private sources, approval history, and run diagnostics remain inaccessible to public roles.
- Existing design, architecture, and installed dependencies are retained. No public admin route or hosted authentication was added.
- [The operator guide](REVIEW-PUBLISH.md) explains setup, commands, privacy, limitations, and uncertain-write recovery.

## Status — implementation verified; stopped at deadline check

Implementation is present and uncommitted on `feat/supabase-v1`. The last clock check returned September 2, 2026 at 19:44 UTC (3:44 PM New York), after the 8 AM cutoff. Development stopped immediately at that check, with only checkpointing and pausing the follow-up afterward. The earlier clock check was 07:07 UTC (3:07 AM); the reason for the elapsed-time gap is not established. Do not claim that an 8 AM hard stop was mechanically enforced.

Verified results:

- Lint, TypeScript, and Git whitespace checks passed.
- All 63 offline application tests passed across the recorded suite runs: six original event tests, 31 ingestion tests, 16 dashboard tests, and ten review tests. The expanded review suite was rerun after its final changes.
- All 145 pgTAP assertions passed in a disposable database, including 51 new review/publication assertions.
- Real local CLI listing, inspection, preview, stale-approval rejection, and explicit synthetic publication passed. Concurrent publication produced one approval record; later ingestion preserved published fields and the audit snapshot. Concurrent ingestion also passed. All five database-runner tests passed and its disposable database was removed.
- The production build passed in `codex-tmp/review-release.6OHZei/`, followed by both production-output tests. `/` remains dynamic and `/sample` static.
- All seven production HTTP tests passed in an isolated Docker container with networking disabled, including safe registration links, private-field exclusion, empty/error/recovery states, and streaming. The container exited successfully and was automatically removed.
- The last read-only check of the normal database found six events, six sources, and one run. No normal-database writes, migrations, resets, or actual event publications were performed.

## Verification limitations and remaining review

The sandbox rejected cleanup of the normal `.next/diagnostics` directory and local listening ports, including approved elevated retries. Production verification used a fresh selected-file copy without environment files. Runtime tests used `codex-tmp/review-runtime.xveKaU/`, mounted installed dependencies read-only, and the cached Supabase Studio image's Node runtime. The runtime copy omitted the empty `next.config.ts` and used equivalent default configuration; the production build output was unchanged.

No browser visual/interaction review was performed: this was a background local-only cycle, and the Sites guidance preserved the existing theme without opening a browser or deploying. The new link was verified through rendered HTML. A normal-Terminal build/preview pass remains an operational follow-up. The root `.next` directory is not the verified release build. The final independent diff review was not completed before the late deadline check; review the changes before committing.

The ignored build/runtime folders and `codex-tmp/prepare-review-build.mjs` are disposable verification artifacts, not deliverables. They contain no copied environment files, saved credentials, or downloaded real listings.

The normal database has not received the new migration. After reviewing this increment, apply pending migrations without resetting data before using the new CLI or database-backed dashboard. `/sample` remains independent of the database.

## Remaining external decisions

No real listings have been collected or published by this cycle. The paid live-data smoke test still requires a separate model/budget decision and credentials. Real publication remains a manual approval step. Commits and pushes need fresh user approval.

The final allowance check reported 93% of the current five-hour allowance and 68% of the weekly allowance remaining; the five-hour window had naturally changed since the earlier check. No reset was redeemed, no credits were purchased, and no paid application API calls occurred. This cycle is stopped, not scheduled to resume automatically.

Suggested commit after review: `feat: add local draft review and explicit publication`.
