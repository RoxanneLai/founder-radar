# Dashboard integration checkpoint

## Scope and safeguards

The user approved a local, no-paid-API integration cycle on September 1, 2026: connect the dashboard to published events, separate sample data, preserve private drafts, handle loading/empty/error states, and verify the result. No paid requests, credit purchases or resets, commits, pushes, deployments, or normal-database resets are authorized.

An hourly follow-up was attached to this task with a 10%-remaining usage cutoff and an 8 AM September 2 deadline. It is paused because the agreed implementation and verification are complete. No automatic quota-reset resumption is intended.

## Implementation decisions

- `/` reads only published, non-fixture NYC events through a server-only, anonymous database client. It never uses the ingestion service-role credential.
- `/sample` preserves the fictional edition, explicitly labeled throughout. An empty or failed database response never silently falls back to samples.
- Unknown prices, scores, organizers, and end times remain unknown. No model or scoring requests run from a page load.
- Support the actual auth-disabled local Supabase setup without an API key. If local authentication is enabled later, accept only an anonymous/public key. Never silently downgrade a failed authenticated request or use a service-role fallback.
- Keep the existing visual design and dependencies; no redesign, image generation, or hosting work.
- Test synthetic records only in isolated test databases or local HTTP stubs. Preserve the normal database.

## Status — complete September 2, 2026

The implementation is complete and left uncommitted on `feat/supabase-v1` for review. The existing visual design was retained; no new dependencies were installed.

## Verification

- All 53 offline application tests passed: six original unit tests, 31 ingestion tests, and 16 dashboard tests.
- All 94 database assertions passed in a disposable database, including ten new dashboard/privacy checks. The real concurrent-ingestion test also passed. The disposable database was removed.
- Lint, TypeScript, formatting, and Git whitespace checks passed.
- The final production build passed in `codex-tmp/dashboard-release.h4foNt/`. `/` is dynamically rendered and `/sample` is prerendered; both production-output tests passed.
- All six production HTTP tests passed: fresh published records, hidden drafts/archives/fixtures/private fields, empty/error/recovery states, request-time configuration, sample-route independence, keyless local reads, and loading-state streaming. These tests used synthetic HTTP responses, not live event data.
- A separate read-only check of the real local Supabase API through the dashboard loader passed. The fixture-only database correctly produced an empty published feed. The local stack has authentication disabled, so it exposes anonymous reads without an API key; `db:status` therefore does not provide an anonymous key.
- The normal database still contains exactly six events, six source records, and one run. It was not migrated, reset, seeded, or otherwise written to during this cycle.

## Environment limitations and verification copies

The sandbox still rejects starting local listening ports and deleting existing `.next/diagnostics`, including approved elevated retries. This also affects rebuilding an existing verification folder. The final build used a new ignored folder containing only selected project files and an installed-dependency symlink; no environment files or credentials were copied.

Production HTTP tests ran in a temporary Docker container using the already-installed Supabase Studio image's Node.js runtime, with networking disabled. The sanitized runtime copy was in `codex-tmp/dashboard-runtime.1RjkrM/`, with installed dependencies mounted read-only. Its empty `next.config.ts` was represented by an equivalent empty `next.config.mjs` to avoid needing Linux compiler binaries merely to load the configuration. The real Next.js production output was unchanged. All test containers were stopped and removed. The separate real-Supabase read used only the local gateway's network and made no writes.

No browser-based visual or interaction review was performed. The HTTP tests verify rendered HTML and loading streaming, not screenshots. The normal-checkout build and local preview still need a host-Terminal verification pass because of the sandbox limitations; the root `.next` output is not the verified final build.

The ignored verification folders and `codex-tmp/check-dashboard-local.mjs` are disposable development artifacts. They contain no copied environment files, saved credentials, or downloaded live data.

## Morning startup

Keep Docker Desktop running. For this project's current auth-disabled local stack, the regular Terminal startup is:

```bash
npm run db:start
SUPABASE_URL=http://127.0.0.1:54321 npm run dev
```

Leave `SUPABASE_ANON_KEY` unset for this local mode. If it was previously configured, clear that value in your own environment before starting. Open `http://localhost:3000` for published events or `http://localhost:3000/sample` for the fictional edition. An empty published feed is expected until real drafts have been reviewed and explicitly published. See [the dashboard guide](DASHBOARD.md) for persistent configuration and the full verification commands.

## Spending and next decision

No paid application API calls, credit purchases, resets, commits, pushes, or deployments were performed. The final usage check showed approximately 29% of the five-hour Codex allowance and 74% of the weekly allowance remaining. Work stopped because this scoped increment was complete, not because credits ran out.

The next development step still requires your decision: choose the API model and a separate small testing budget, configure ingestion access, apply its pending migration without resetting existing data, and verify three real listings plus repeat-run behavior. No events were automatically published, no public registration-link boundary was added, and the live ingestion acceptance gate remains unverified.

Suggested commit after review: `feat: connect dashboard to published database events`.
