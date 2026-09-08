# Ingestion build checkpoint

## Scope

Build a manually triggered, bounded OpenAI web-search ingestion pipeline and its offline/database tests. The overnight run excluded paid API calls, commits, pushes, deployments, and dashboard changes. The user subsequently verified the normal checkout and approved committing the implementation.

## Completed implementation

- Server-only OpenAI and Supabase dependencies are pinned in the manifest and lockfile.
- Generated database types and a transactional source-to-draft RPC are implemented.
- The provider separates bounded hosted web research from tool-free structured extraction, following the current official OpenAI documentation.
- Validation checks quoted evidence, supported URLs, dates, time zones, location, relevance, and unknown fields. Search reports are explicitly model-generated evidence, not downloaded page bodies; all new events remain drafts.
- The command defaults to a no-network plan and requires both a live flag and an environment opt-in for paid calls. There are no automatic paid retries.
- Run summaries, private research evidence, safe errors, and local recovery checkpoints are implemented. Failed observations preserve prior successful evidence and event links.

## Verification results

- 31 ingestion tests passed, including real SDK transport tests with stubbed HTTP, repeat runs, malformed output, quota errors, cancellation, and checkpoint failures.
- All 84 pgTAP assertions passed: 37 ingestion-boundary checks and 47 existing foundation checks.
- A real concurrent-save test passed: two simultaneous writes produce one source and one linked draft.
- All six existing application unit tests passed.
- Lint, TypeScript, formatting, and Git whitespace checks passed.
- The production build and production HTML test passed in a fresh disposable verification folder.
- The no-network plan printed successfully. Live mode without its paid opt-in stopped before any API request.
- Dependency audit reported zero vulnerabilities.

## Local verification follow-up

The user successfully ran `npm ci` in the normal project folder, installing 379 packages with zero reported vulnerabilities. Lint, TypeScript, all 37 unit/ingestion tests, the production build, and the production HTML test then passed there. The missing-dependency issue is resolved; live API verification remains pending.

## Overnight environment limitation

During the overnight build, the sandbox rejected deletion of some existing directories, including npm's old `node_modules/tw-animate-css/dist` and an existing `.next/diagnostics`. Approved retries hit the same error. The manifest and lockfile updated successfully; refreshing installed dependencies required the user's subsequent Terminal run described above.

Application checks ran in `codex-tmp/ingestion-verify/` after a clean install. The final production check used `codex-tmp/ingestion-final-build/` with the same installed dependencies and fresh build output. These ignored folders are disposable; they contain no live API data or copied environment files. The nested verification folder triggered a harmless Next.js multiple-lockfile warning.

The Terminal installation and verification are now complete. The sandbox's directory-cleanup behavior has not been reverified and is separate from Git metadata permissions.

## Preserved state and spending

- During the overnight run, no paid application API calls, credit purchases, resets, commits, pushes, or deployments were performed.
- The normal local database was not migrated or reset: it still contains six fixture events, six fixture sources, and one fixture run.
- All temporary databases created for this build were removed; their contents were disposable synthetic fixtures.
- Codex allowance was checked between milestones. The last check showed approximately 70% of the five-hour allowance and 80% of the weekly allowance remaining. The run stopped because its scoped implementation was complete, not because of a usage limit.

## Remaining next steps

1. Start the local stack and apply the pending ingestion migration using `npm run db:migrate`; do not reset existing data.
2. Choose an API model, supply credentials securely, and approve a small separate API testing budget.
3. Follow [the ingestion guide](INGESTION.md) for a bounded live run and repeat-run verification.
4. Verify three real upcoming events against their source pages. This live acceptance gate remains **unverified**.
