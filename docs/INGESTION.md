# First ingestion agent

## Status and scope

The implementation is a manually triggered, local-only ingestion command. It discovers NYC in-person/hybrid founder and investor event listings, extracts structured fields, and persists draft events with provenance. It does not modify the dashboard, publish events, compute scores, run on a schedule, or register for events.

**Live API verification has not been performed.** The overnight build is tested with synthetic provider responses and a disposable PostgreSQL database. Finding three real, correctly dated events remains a separately approved acceptance check, not an accomplished result.

## What happens in one run

1. Validate the search dates and result limit and create a search-run record.
2. Ask the OpenAI Responses API to research public listings using its hosted web-search tool.
3. Keep individual event URLs on Luma, Meetup, and Eventbrite that occur in tool-returned sources or citation metadata. Normalize aliases and tracking parameters; cap retained candidates at the requested limit.
4. Save the research report and consulted URLs privately in the search run. Persist candidate sources before extraction.
5. Make one tool-free structured-output request to extract fields with supporting quotes from that report.
6. Validate title, date/time zone, relevance, city, format, and date window. Save usable candidates as drafts; retain incomplete sources unlinked with a diagnostic code.
7. Finish with counts, safe error codes, model usage when available, and a local recovery checkpoint.

The provider adapter never writes to the database. The repository owns persistence through one transactional RPC, `ingest_event_source`. Concurrent saves of the same provider URL or external ID reuse a source and event. Original `first_seen_at` and discovery-run attribution are retained.

### Evidence is not a page archive

This version uses **model-generated web-search reports**, not a bespoke page scraper. `content_text` stores that report and `raw_payload.evidence_kind` identifies it as `model_web_search_report`. `fetched_at` means the report was retrieved, not that our process independently fetched the source page. `http_status` remains unknown. Supporting quotes must occur in the report, but this cannot prove the report or the extracted interpretation is factually correct.

Review drafts against their original links before publishing. Search indexing may miss events or surface stale listings. Search is not an exhaustive provider feed. Same-event deduplication across platforms, recurring-event instances, and semantic field verification remain future work.

Official references: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc).

## Start safely: no-network plan

Install the checked-in dependencies first:

```bash
npm ci
npm run ingest -- --limit 3
```

Without `--live`, the command only prints the proposed search and limits. It makes no network requests or database changes, and does not require credentials. The default search starts now and ends 14 days later.

For repeatable tests, supply both ISO timestamps, including an explicit offset or `Z`:

```bash
npm run ingest -- --from 2026-09-02T00:00:00-04:00 --to 2026-09-16T00:00:00-04:00 --limit 3
```

Replace these example dates when they are no longer current. The start is inclusive and the end is exclusive.

## Prepare live mode

1. Review the changes and agree on a small **separate OpenAI API testing budget**. Codex allowance does not pay for these API requests.
2. Start Docker Desktop and the local stack with `npm run db:start`.
3. Apply pending local migrations using `npm run db:migrate`. This adds the ingestion RPC and attempt-diagnostic columns without resetting data. Do not use `db:reset` on a database containing data you want to keep.
   The local configuration now enables authentication with sign-ups disabled. After upgrading from the old auth-disabled setup, use `npm run db:stop` then `npm run db:start` to activate it without deleting data. Obtain the local service-role key from `npm run db:status` in your own Terminal; keep the output private. The dashboard uses a different, anonymous/public key.
4. Supply the following server-side environment variables in the terminal where the command will run:

| Variable                       | Purpose                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`               | A key for the API project whose testing spend you approved                                            |
| `OPENAI_MODEL`                 | An explicit model available to that project that supports Responses web search and structured outputs |
| `SUPABASE_URL`                 | The local API endpoint, normally `http://127.0.0.1:54321`                                             |
| `SUPABASE_SERVICE_ROLE_KEY`    | The local stack's service-role key; never a browser/public variable                                   |
| `FOUNDER_RADAR_ALLOW_PAID_API` | Must be exactly `1` in addition to the `--live` flag                                                  |

The command reads its environment only; it does **not** automatically load `.env` or `.env.local`. Use your preferred secure environment/secret manager. Do not put credentials in source files, command-line arguments, progress notes, or chat. Do not prefix private keys with `NEXT_PUBLIC_`. Only loopback HTTP database URLs with an explicit port are accepted in this version.

5. After the budget and credentials are ready, run the same bounded command with `--live`:

```bash
npm run ingest -- --live --limit 3
```

No model is silently selected, and no live run is launched by the test commands or by viewing the dashboard.

## Bounds and failure behavior

| Limit                      | Current value                                        |
| -------------------------- | ---------------------------------------------------- |
| Retained candidate sources | 1–10; default 10                                     |
| Search interval            | More than zero, at most 31 days                      |
| Model API requests         | At most 2 per provider instance/run                  |
| Hosted search-tool calls   | At most 3, requested with `max_tool_calls`           |
| Research output tokens     | At most 6,000                                        |
| Extraction output tokens   | At most 12,000                                       |
| Research text accepted     | At most 40,000 characters                            |
| Provider request timeout   | 120 seconds                                          |
| Database request timeout   | 15 seconds                                           |
| Run cancellation deadline  | 5 minutes, followed by bounded database finalization |
| Automatic API retries      | None, including quota/rate errors                    |

These are work/request bounds, **not a dollar-accurate billing cap**. Input and tool usage can still be billed. Check current model/tool pricing and account billing controls before enabling live calls. The installed SDK's stable request type omits the documented `max_tool_calls` field; the adapter explicitly includes it and the offline SDK transport test verifies it is sent. Its live behavior must still be confirmed in the smoke test.

The application never fetches arbitrary model-provided URLs directly and does not follow local HTTP redirects. Source access is handled by OpenAI's hosted search service. Search-page content is treated as untrusted data in both prompts; extraction has no tools, and model output cannot select database operations or publication status.

Failed or discovery-only observations preserve earlier successful content, retrieval time, and event links. New valid observations update draft facts. Published, archived, and fixture events are not rewritten by the agent. An older observation cannot overwrite a newer one. Conflicting URL/external-ID identities are rejected for review, not automatically merged.

`last_attempt_at` and `last_attempt_error` are distinct from the last successful evidence snapshot. Per-run usage, report, consulted URLs, and summary live in private `search_runs.metadata`. The source stores the latest successful candidate snapshot; it is not an append-only observation history.

## Verification without paid calls

```bash
npm run lint
npm run typecheck
npm test
npm run db:test:isolated
npm run build
npm run test:next
```

`db:test:isolated` requires the existing local Supabase Docker container. It creates a uniquely named disposable database, applies all migrations and fixture seeds, runs every pgTAP contract plus a concurrent-save test, and drops only that disposable database afterward. It does not reset the user's normal database. If forcibly interrupted, it may leave a database beginning with `fr_ingestion_test_`; inspect before removing it.

Generated TypeScript types are in `lib/database.types.ts`. They were generated with Supabase postgres-meta from the migrated schema. After applying future migrations, `npm run db:types -- --schema public` prints fresh types; save and format them before typechecking.

## Inspect and recover

The command prints a safe final JSON summary and saves milestone snapshots to ignored `codex-tmp/ingestion-<run-id>.json`. Snapshots contain counts and diagnostic codes, not credentials or source content. `events_written` counts inserted or refreshed drafts, not necessarily newly created events. `sources_unlinked` counts persisted candidates still lacking an event link.

- `succeeded`: the bounded run completed without recorded errors; it may legitimately find zero events.
- `partial`: at least one source was saved, but some extraction, validation, or other step failed.
- `failed`: the run could not persist candidates.
- `cancelled`: SIGINT/SIGTERM or the deadline stopped the run.
- `running`: a checkpoint, or a database run interrupted before finalization.

Only `succeeded` exits with code 0. A killed process, power loss, or database outage may leave a run marked `running`; no program can guarantee cleanup after a hard kill. Preserve that record and its local checkpoint. Confirm the original process has stopped, inspect the saved counts/errors, then start a new bounded run. Repeated source ingestion is safe. Do not blindly replay a paid request after an ambiguous timeout; inspect its API usage first.

Common codes:

| Code                                              | Next action                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `paid_api_not_enabled`                            | Expected safety gate; approve budget before setting the opt-in                         |
| `missing_ingestion_environment`                   | Supply the required server-side variables                                              |
| `local_database_required`                         | Use the local stack, not a hosted project                                              |
| `ingestion_migration_required`                    | Apply the pending local migration                                                      |
| `ingestion_preflight_failed`                      | Check the local stack, service-role access, and pending migration before any API spend |
| `provider_quota_or_rate_limit`                    | Stop; inspect API quota/billing/rate limits before another paid run                    |
| `provider_incomplete` / `provider_request_failed` | Inspect API usage; do not automatically retry                                          |
| `incomplete_event` / `candidate_missing`          | Inspect the private source/research report; leave the source unlinked                  |
| `run_finish_failed`                               | Use the local checkpoint; the database run may still say running                       |
| `progress_write_failed`                           | Local recovery-file write failed; inspect the database summary                         |

## Live acceptance gate still pending

- Run with a small agreed API budget and a current, fixed date window.
- Verify three real upcoming NYC events against their original links, including year, timezone, venue, relevance, and unknown fields.
- Confirm all new events remain nonfixture drafts and have source URLs/evidence.
- Repeat the same bounded search and confirm the same source identities reuse records.
- Review actual request counts, model/tool usage, and cost before expanding the limit.
- Review any real drafts before explicitly authorizing publication to the already-integrated dashboard. Expand to additional providers only after this check passes.
