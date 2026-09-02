# First ingestion agent

## Status and scope

The implementation is a manually triggered ingestion command using **OpenRouter** and a local-only database. It discovers NYC in-person/hybrid founder and investor event listings, extracts structured fields, and persists draft events with provenance. It does not modify the dashboard, publish events, compute scores, run on a schedule, or register for events. The previous direct OpenAI transport has been replaced; historical run records and checkpoints are unchanged.

**Live API acceptance has not passed.** The first approved comparison reached OpenRouter but stopped on `search_not_performed` before saving any sources/events or trying the second model. The old diagnostic could mean either missing search usage or an explicit zero. Its response ID and cost were not retained, so the cause and charge cannot be recovered from the local run record. Finding three real, correctly dated events remains an uncompleted acceptance check.

## What happens in one run

1. Validate the search dates and result limit and create a search-run record.
2. Ask the configured model through OpenRouter's Chat Completions endpoint to research public listings using its `openrouter:web_search` server tool. The model controls its search queries; the tool uses Exa with explicit search/result bounds.
3. Keep individual event URLs on Luma, Meetup, and Eventbrite that occur in returned URL-citation annotations. Plain URLs invented in the report cannot authorize ingestion. Normalize aliases and tracking parameters; cap retained candidates at the requested limit.
4. Save the research report and consulted URLs privately in the search run. Persist candidate sources before extraction.
5. Make one tool-free structured-output request to extract fields with supporting quotes from that report.
6. Validate title, date/time zone, relevance, city, format, and date window. Save usable candidates as drafts; retain incomplete sources unlinked with a diagnostic code.
7. Finish with counts, safe error codes, model usage when available, and a local recovery checkpoint.

The provider adapter never writes to the database. The repository owns persistence through one transactional RPC, `ingest_event_source`. Concurrent saves of the same provider URL or external ID reuse a source and event. Original `first_seen_at` and discovery-run attribution are retained.

### Evidence is not a page archive

This version uses **model-generated web-search reports**, not a bespoke page scraper. `content_text` stores that report and `raw_payload.evidence_kind` identifies it as `model_web_search_report`. `fetched_at` means the report was retrieved, not that our process independently fetched the source page. `http_status` remains unknown. Supporting quotes must occur in the report, but this cannot prove the report or the extracted interpretation is factually correct.

Review drafts against their original links before publishing. Search indexing may miss events or surface stale listings. Search is not an exhaustive provider feed. Same-event deduplication across platforms, recurring-event instances, and semantic field verification remain future work.

Official references: [OpenRouter server-side web search](https://openrouter.ai/docs/guides/features/server-tools/web-search), [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc). OpenRouter currently labels server tools beta; real-account behavior remains part of the live acceptance test.

## Start safely: no-network plan

Install the checked-in dependencies first:

```bash
npm ci
npm run ingest -- --limit 3
```

Without `--live`, the command reads the non-secret model configuration and prints the selected model, proposed search and limits. It makes no network requests or database changes and never opens `OPENROUTER.key`. The default search starts now and ends 14 days later. Run commands from the repository root.

## Select the backend model

The checked-in default is in `config/ingestion.json`:

```json
{
  "model": "openai/gpt-4.1"
}
```

This is an editable starting default, not a claim that it is optimal or live-verified. Set it to an explicit OpenRouter `vendor/model-id` whose endpoint supports tool calling and JSON-schema structured outputs. Requests require parameter support and disable provider fallbacks; an incompatible model fails rather than silently switching models or dropping the requested schema.

Override the model for one run with `--model`, or select another non-secret JSON configuration with `--config`:

```bash
npm run ingest -- --model openai/gpt-4.1-mini --limit 3
npm run ingest -- --config config/ingestion.json --model openai/gpt-4.1 --limit 3
```

Precedence is **`--model` over the selected configuration's `model`**. Both research and extraction use that selection. `OPENAI_MODEL` and other model environment variables are not used. The configuration must exist and contain only a valid `model` field, even when overriding it. Missing/malformed files and duplicate CLI flags stop before any API request. Auto-router model IDs and the deprecated `:online` suffix are rejected, so search stays in the explicitly bounded server tool.

Configuration paths are relative to the working directory (absolute paths also work). The credential path is always `./OPENROUTER.key`, not relative to a custom config file. Do not put keys, a custom API URL, or a paid opt-in into the JSON file.

## Supply the credential file

Create **`OPENROUTER.key` in the repository root**, containing only the bare OpenRouter API key on one line. No JSON, quotes, `Bearer` prefix, or variable assignment. Leading/trailing whitespace and a final newline are accepted. The loader requires a regular, non-symlink file of at most 4 KiB; missing, unreadable, empty or malformed files produce safe errors without printing contents.

`OPENROUTER.key` is ignored by Git. Keep it outside `public/` and protect it with restrictive local permissions, such as `chmod 600 OPENROUTER.key`. Never paste the key into chat, source code, CLI arguments or reports. The program reads it only in explicitly enabled live mode, after validating the paid opt-in and local database settings. Neither the dashboard nor offline tests need the real key file. There is no fallback to an OpenAI key or environment API key.

For repeatable tests, supply both ISO timestamps, including an explicit offset or `Z`:

```bash
npm run ingest -- --from 2026-09-02T00:00:00-04:00 --to 2026-09-16T00:00:00-04:00 --limit 3
```

Replace these example dates when they are no longer current. The start is inclusive and the end is exclusive.

## Prepare live mode

1. Review the plan's model and agree on a small **separate OpenRouter testing budget**, including hosted search and model usage. Supplying a key does not itself authorize a live run.
2. Start Docker Desktop and the local stack with `npm run db:start`.
3. Apply pending local migrations using `npm run db:migrate`. This adds the ingestion RPC and attempt-diagnostic columns without resetting data. Do not use `db:reset` on a database containing data you want to keep.
   The local configuration now enables authentication with sign-ups disabled. After upgrading from the old auth-disabled setup, use `npm run db:stop` then `npm run db:start` to activate it without deleting data. Obtain the local service-role key from `npm run db:status` in your own Terminal; keep the output private. The dashboard uses a different, anonymous/public key.
4. Supply `OPENROUTER.key` as described above and the following server-side environment variables in the terminal where the command will run:

| Variable                       | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `SUPABASE_URL`                 | The local API endpoint, normally `http://127.0.0.1:54321`           |
| `SUPABASE_SERVICE_ROLE_KEY`    | The local stack's service-role key; never a browser/public variable |
| `FOUNDER_RADAR_ALLOW_PAID_API` | Must be exactly `1` in addition to the `--live` flag                |

The command reads model configuration and `OPENROUTER.key` separately from these environment variables; it does **not** automatically load `.env` or `.env.local`. Use your preferred secure environment/secret manager for database credentials. Do not put credentials in source files, command-line arguments, progress notes, or chat. Do not prefix private keys with `NEXT_PUBLIC_`. Only loopback HTTP database URLs with an explicit port are accepted in this version.

5. After the budget and credentials are ready, run the same bounded command with `--live`:

```bash
npm run ingest -- --live --limit 3
```

The same model default/override applies in plan and live modes. No live run is launched by the test commands or by viewing the dashboard.

## Bounds and failure behavior

| Limit                      | Current value                                             |
| -------------------------- | --------------------------------------------------------- |
| Retained candidate sources | 1–10; default 10                                          |
| Search interval            | More than zero, at most 31 days                           |
| OpenRouter API requests    | At most 2 per provider instance/run                       |
| Hosted search-tool calls   | At most 3, requested with `max_tool_calls` and `max_uses` |
| Search results             | At most 5 per search, 15 total                            |
| Search-result content      | At most 2,000 characters per result                       |
| Research output tokens     | At most 6,000                                             |
| Extraction output tokens   | At most 12,000                                            |
| Research text accepted     | At most 40,000 characters                                 |
| API response body          | At most 1 MiB before JSON parsing                         |
| Provider request timeout   | 120 seconds                                               |
| Database request timeout   | 15 seconds                                                |
| Run cancellation deadline  | 5 minutes, followed by bounded database finalization      |
| Automatic API retries      | None, including quota/rate errors                         |

These are work/request bounds, **not a dollar-accurate billing cap**. OpenRouter may perform several internal model turns while executing searches within the first API request. Input, model output and hosted search can be billed, even when validation later rejects the result. Check current model/tool pricing and account billing controls before enabling live calls. Offline transport tests verify the requested limits, but live enforcement still needs confirmation. The adapter requires reported search usage, rejects reported over-budget research, and never automatically retries credit exhaustion, rate limits or other failures. Exa is fixed as the search engine so switching LLMs cannot silently select native search with different limit behavior.

The application's paid requests go only to the fixed `https://openrouter.ai/api/v1/chat/completions` endpoint; redirects are rejected. It never fetches arbitrary model-provided URLs directly. Source access is handled by OpenRouter's hosted search tool. Search-page content is treated as untrusted data in both prompts; extraction has no tools, and model output cannot select database operations or publication status.

Failed or discovery-only observations preserve earlier successful content, retrieval time, and event links. New valid observations update draft facts. Published, archived, and fixture events are not rewritten by the agent. An older observation cannot overwrite a newer one. Conflicting URL/external-ID identities are rejected for review, not automatically merged.

`last_attempt_at` and `last_attempt_error` are distinct from the last successful evidence snapshot. New runs are labeled `openrouter-web-search`, with the selected model saved in `search_parameters` before paid requests. Per-run requested/returned model, response ID, token usage, provider-reported cost when present, report, consulted URLs, and summary live in private `search_runs.metadata`. Missing usage fields stay unknown. The source stores the latest successful candidate snapshot; it is not an append-only observation history.

## Verification without paid calls

```bash
npm run lint
npm run typecheck
npm test
npm run db:test:isolated
npm run build
npm run test:next
```

`db:test:isolated` requires the existing local Supabase Docker container. It creates a uniquely named disposable database, applies all migrations and fixture seeds, runs every pgTAP contract plus review/concurrency tests, and drops only that disposable database afterward. It does not reset the user's normal database. If forcibly interrupted, it may leave a database beginning with `fr_review_test_`; inspect before removing it.

### OpenRouter implementation checkpoint — September 2, 2026

Lint, TypeScript, formatting, all 71 offline tests (including 39 ingestion tests), and the isolated database suite (145 assertions plus five runner tests) passed. Offline tests ran in a disposable Docker container with networking disabled because host-sandbox cleanup of test directories failed with `EPERM`, even with approval. All credentials and API responses in those tests were synthetic. The production build and both built-output tests passed in a credential-free copy under `codex-tmp/openrouter-release.EY061I`, leaving the active dashboard build untouched; Next.js reported the expected nested-workspace lockfile warning.

The unused direct OpenAI SDK was removed from the dependency manifest, lockfile, and installed dependencies; its earlier adapter/tests remain recoverable in Git history. The installed cleanup was completed in the regular Terminal and verified with `npm ls openai --depth=0`. No real key was read, no live API request was made, and no normal database events were collected or published for this implementation.

Generated TypeScript types are in `lib/database.types.ts`. They were generated with Supabase postgres-meta from the migrated schema. After applying future migrations, `npm run db:types -- --schema public` prints fresh types; save and format them before typechecking.

## Inspect and recover

The command prints a safe final JSON summary and saves milestone snapshots to ignored `codex-tmp/ingestion-<run-id>.json`, creating new files with owner-only permissions. Snapshots contain counts, diagnostic codes, and allowlisted provider diagnostics, not credentials or source content. `events_written` counts inserted or refreshed drafts, not necessarily newly created events. `sources_unlinked` counts persisted candidates still lacking an event link.

### Safe diagnostics for rejected responses

`provider_diagnostics` in the summary (also saved in private `search_runs.metadata.summary`) contains at most two request snapshots per provider instance. Each identifies the research/extraction phase, HTTP status, bounded response ID and model identifiers, known finish reason, token usage and provider-reported cost when available. Citation/tool-call counts and content length describe response structure without saving response text, URLs, prompts, headers, tool arguments, or raw errors. Reflected API credentials and key-like identifiers are excluded.

Diagnostics are captured before response validation and included in the final recovery snapshot even when research, extraction, or database finalization fails. A response ID or cost is retained only if actually returned and safely parsed; network errors, non-JSON or oversized responses, and non-success HTTP responses may have no such details. Missing or invalid numbers stay `null`, never zero. These figures are provider reports, not independently verified billing totals.

- `search_usage_missing`: the documented search counter is absent or null; search execution is **unknown**, even if citation annotations are present.
- `search_not_performed`: the counter explicitly reports zero searches.
- Invalid counters still fail response validation; diagnostics mark `search_usage` as `invalid` when a malformed counter is present.

None of these cases permits extraction or event creation. Search limits, citations, no-retry behavior, and publication safeguards are unchanged. Inspect diagnostics and account usage before authorizing another paid request. Old failed run records remain unchanged; the added logging cannot reconstruct an earlier discarded response.

The diagnostic fix passed lint, TypeScript, and all 78 offline tests, including missing/zero/invalid search usage, rejected-response cost retention, credential exclusion, and recovery after failed extraction or finalization. No paid retry was performed as part of this fix.

### Run statuses

- `succeeded`: the bounded run completed without recorded errors; it may legitimately find zero events.
- `partial`: at least one source was saved, but some extraction, validation, or other step failed.
- `failed`: the run could not persist candidates.
- `cancelled`: SIGINT/SIGTERM or the deadline stopped the run.
- `running`: a checkpoint, or a database run interrupted before finalization.

Only `succeeded` exits with code 0. A killed process, power loss, or database outage may leave a run marked `running`; no program can guarantee cleanup after a hard kill. Preserve that record and its local checkpoint. Confirm the original process has stopped, inspect the saved counts/errors, then start a new bounded run. Repeated source ingestion is safe. Do not blindly replay a paid request after an ambiguous timeout; inspect its API usage first.

Common codes:

| Code                                                  | Next action                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `paid_api_not_enabled`                                | Expected safety gate; approve budget before setting the opt-in                                         |
| `missing_ingestion_environment`                       | Supply the required server-side variables                                                              |
| `invalid_ingestion_config`                            | Check the JSON file and explicit OpenRouter model ID; use `--model` for an override                    |
| `openrouter_key_file_unavailable`                     | Supply a readable, regular `OPENROUTER.key` in the working directory, at most 4 KiB                    |
| `invalid_openrouter_key_file`                         | Use one bare key, without JSON, quotes or a `Bearer` prefix                                            |
| `provider_authentication_failed`                      | Check the OpenRouter credential locally; never paste it into diagnostics                               |
| `search_usage_missing`                                | Search execution is unknown; inspect safe diagnostics and account usage before another paid attempt    |
| `search_not_performed` / `search_tool_limit_exceeded` | Zero or excessive searches were reported; inspect model/tool compatibility before another paid attempt |
| `provider_diagnostics_unavailable`                    | The diagnostic snapshot could not be read; inspect the run's other safe errors before retrying         |
| `local_database_required`                             | Use the local stack, not a hosted project                                                              |
| `ingestion_migration_required`                        | Apply the pending local migration                                                                      |
| `ingestion_preflight_failed`                          | Check the local stack, service-role access, and pending migration before any API spend                 |
| `provider_quota_or_rate_limit`                        | Stop; inspect API quota/billing/rate limits before another paid run                                    |
| `provider_incomplete` / `provider_request_failed`     | Inspect API usage; do not automatically retry                                                          |
| `incomplete_event` / `candidate_missing`              | Inspect the private source/research report; leave the source unlinked                                  |
| `run_finish_failed`                                   | Use the local checkpoint; the database run may still say running                                       |
| `progress_write_failed`                               | Local recovery-file write failed; inspect the database summary                                         |

## Live acceptance gate still pending

- Run with a small agreed API budget and a current, fixed date window.
- Verify three real upcoming NYC events against their original links, including year, timezone, venue, relevance, and unknown fields.
- Confirm all new events remain nonfixture drafts and have source URLs/evidence.
- Repeat the same bounded search and confirm the same source identities reuse records.
- Review actual request counts, model/tool usage, and cost before expanding the limit.
- Review any real drafts before explicitly authorizing publication to the already-integrated dashboard. Expand to additional providers only after this check passes.
