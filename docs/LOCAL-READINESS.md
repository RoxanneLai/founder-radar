# Local readiness checkpoint — September 2, 2026

This pass prepares the existing agent and dashboard without paid API calls, live discovery, or real publication. Earlier overnight checkpoints are historical records, not current setup instructions.

## Verified

- Backed up the normal local database's `public` and migration schemas to a private, ignored file under `codex-tmp/` before migration.
- The operator applied migrations `20260902010000` and `20260902061000` using `npm run db:migrate` in the host Terminal. Database inspection confirmed all three committed migration versions.
- Existing data was preserved: six fixture events, six sources, and one search run.
- Lint, TypeScript checks, and all 63 offline tests passed.
- The three-candidate ingestion preview remained plan-only, with no database writes or paid calls.
- The operator restarted the local stack successfully. Authentication, API gateway, database, and Studio are running; all three migrations and the original record counts were confirmed again after restart.
- The isolated database suite passed all 145 pgTAP assertions and five workflow/concurrency tests. Its disposable database was removed; the normal database still contains no non-fixture events.
- Local anonymous and service-role credentials are available. The actual API accepts the privileged ingestion schema preflight. Database permission checks confirm that this role can create search runs and execute ingestion, while the anonymous role cannot ingest.
- Both anonymous-key and keyless API requests are denied access to private sources, search runs, and review history. The local API still permits keyless reads of public events; authentication being enabled does not imply every public request needs a key. Local authentication settings confirm sign-ups are disabled.
- The actual dashboard data loader, using the local anonymous credential against the running API, returns the expected empty feed and excludes fixtures. Credentials were passed in memory, never printed or saved in test files. This checks the loader/API connection, not the host Next.js process's environment.
- Browser verification of the host dashboard also passed after the operator started Next.js with `SUPABASE_URL=http://127.0.0.1:54321`. The page at `http://localhost:3000/` progressed through its loading state to “No published events yet,” with zero events shown. The earlier “not connected” state is resolved; an empty published feed is expected until real drafts are reviewed and published.

## Configuration and environment limitations

Local Supabase authentication is now enabled in `supabase/config.toml`, with sign-ups disabled. This supplies separate anonymous/public dashboard credentials and privileged service-role ingestion credentials. It does not add a public login flow. Updated setup instructions are in [the dashboard guide](DASHBOARD.md) and [the ingestion guide](INGESTION.md).

The stack was stopped using the data-preserving default. Restart attempts from the sandbox failed on local database connectivity, including an approved elevated retry; the operator completed startup in the regular Terminal. No reset or `--no-backup` option was used. API verification ran inside the local Docker network because direct host-loopback access from the sandbox is unavailable. No normal database records were created or published during these access checks.

Initial checks could not reach `localhost:3000` because the dashboard server was not running. Starting it from the sandbox remained blocked by `listen EPERM`, even with approval. The operator started it in the host Terminal and supplied the database address; the in-app browser then successfully verified the connected page. Host Terminal startup remains necessary in this environment. No production rebuild was required for this configuration/documentation-only change.

## Next boundary

Local database, API, and connected-browser readiness checks have passed. Choosing a model, configuring private API credentials, and approving a small separate API budget remain prerequisites for the first live run. Keep discovered events as drafts; real publication requires separate explicit review and approval.
