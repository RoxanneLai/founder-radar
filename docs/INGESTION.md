# First ingestion agent

## Status and scope

The implementation is a manually triggered ingestion command using **OpenRouter** and a local-only database. It discovers NYC in-person/hybrid founder and investor event listings, extracts structured fields, and persists draft events with provenance. It does not modify the dashboard, publish events, compute scores, run on a schedule, or register for events. The previous direct OpenAI transport has been replaced; historical run records and checkpoints are unchanged.

**Live discovery, extraction, schema repair, draft persistence, and repeat-run deduplication now work.** A fresh bounded Luna run on September 8 succeeded with two discovered sources, two nonfixture drafts, no unlinked sources, and no errors. Its one conditional repair converted both source-complete candidates to the canonical schema. Operator review archived the already-started event and found no blockers on the upcoming draft. A same-window repeat reused both source and event identities without duplicates and preserved the earlier valid evidence when Luna's relevance judgments changed. Publication of the remaining draft is a separate product decision; relevance consistency remains a model-quality improvement.

## What happens in one run

1. Validate the search dates and result limit and create a search-run record.
2. Ask the configured model through OpenRouter's Chat Completions endpoint to research public listings using its `openrouter:web_search` server tool. The model controls its search queries; the tool uses Exa with explicit search/result bounds.
   Verify the reported search count when present. When it is absent/null, require 1–15 provider-supplied citation annotations, each containing a supported event-listing URL. The request's `max_uses`, `max_tool_calls`, and result limits remain the server-side bounds.
3. Intersect individual event URLs named in the report with returned URL-citation annotations, preserving the report's numbered event order and selecting one primary listing per event section. Duplicate-platform/background citations and plain URLs invented in the report cannot become candidates. Normalize aliases and tracking parameters; cap retained candidates at the requested limit.
4. Save the research report and consulted URLs privately in the search run. Persist candidate sources before extraction.
5. Make one structured-output request with OpenRouter's `openrouter:web_fetch` server tool. Request every selected listing exactly once through the free direct-fetch engine, restricted to the listing allowlist and bounded content size.
6. Return exactly one bounded verdict object per supplied source. Extract facts only when the current page confirms the search report; rejected fetches, conflicts, stale/past pages, cancellations, and virtual-only listings carry an allowlisted rejection code and no facts.
7. If the parsed response contains the exact trusted source set but fails only the canonical candidate schema, make at most one tool-free repair request using the configured repair model. It receives only the candidate JSON and expected URLs. Its output must use the canonical schema and may only rearrange scalar values already present in the corresponding input candidate; otherwise the run fails closed.
8. Verify the reported fetch count when present. When it is absent/null, require exact, unique verdict coverage for every supplied source under the request's required-tool and per-source tool-call bounds.
9. Validate title, date/time zone, relevance, city, format, and date window. Save usable candidates as drafts; retain rejected or incomplete sources with a diagnostic code.
10. Finish with counts, safe error codes, model usage when available, and a local recovery checkpoint.

The provider adapter never writes to the database. The repository owns persistence through one transactional RPC, `ingest_event_source`. Concurrent saves of the same provider URL or external ID reuse a source and event. Original `first_seen_at` and discovery-run attribution are retained.

### Evidence is not a page archive

This version stores **model-generated web-search reports**, not page archives. `content_text` stores that report and new successful observations use `raw_payload.evidence_kind: model_web_search_report_with_source_fetch`; the allowlisted extraction metadata records the fetch-verification mode and reported count when present. OpenRouter provides page text to the model but not to the repository, so `fetched_at` is an evidence timestamp rather than proof of a retained HTTP response and `http_status` remains unknown. Supporting quotes must occur in the report and be confirmed by the fetched page, but the model still interprets both inputs.

Review drafts against their original links before publishing. The fetch gate rejects reported conflicts and missing fetches, but it is not an independent page archive or a guarantee against model error. Search is not an exhaustive provider feed. Same-event deduplication across platforms and recurring-event identity remain future work.

Official references: [OpenRouter server-side web search](https://openrouter.ai/docs/guides/features/server-tools/web-search), [OpenRouter server-side web fetch](https://openrouter.ai/docs/guides/features/server-tools/web-fetch), [OpenRouter reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc). OpenRouter currently labels server tools beta; real-account behavior remains part of the live acceptance test.

## Start safely: no-network plan

Install the checked-in dependencies first:

```bash
npm ci
npm run ingest -- --limit 3
```

Without `--live`, the command reads the non-secret model configuration and prints the selected primary and repair model/effort pairs, proposed search, and limits. It makes no network requests or database changes and never opens `OPENROUTER.key`. The default search starts now and ends 14 days later. Run commands from the repository root.

## Select the backend model and effort

The checked-in default is in `config/ingestion.json`:

```json
{
  "model": "openai/gpt-5.6-luna",
  "effort": "medium",
  "repair_model": "openai/gpt-5.6-luna",
  "repair_effort": "medium"
}
```

Luna at medium effort is the current working default based on its expected price/performance, not a claim that it is optimal or end-to-end verified. Set `model` to an explicit OpenRouter `vendor/model-id` whose endpoint supports reasoning, tool calling, and JSON-schema structured outputs. `effort` must be one of `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Model-specific support differs. OpenRouter may map an unsupported gateway effort to the nearest supported level, so comparisons must verify the exact model/effort pair in the current model catalog first. Requests require parameter support and disable provider fallbacks; an incompatible model fails rather than silently switching models or dropping required parameters.

The repair default also uses Luna at medium effort for one narrow JSON transformation. Qwen 3.5 27B failed closed at both `none` and `low` effort by returning noncanonical aliases unchanged; the low-effort attempt also cost more than the earlier Luna extraction. Muse Spark 1.3 Contributor advertised the required parameters and was visible to the active key, but OpenRouter denied all three isolated repair attempts before contacting its sole endpoint. The final metadata-enabled attempt reported one available endpoint, zero selected endpoints, and router attempt zero, classified safely as model access. Neither experimental model is therefore a working default. The Luna repair-only check completed in 9.822 seconds for a provider-reported $0.00208335. It transformed all three source-complete candidates into the canonical schema, retained two usable events and one fact-free `source_fetch_failed` verdict, and passed the local source-coverage and scalar-preservation gates. The repair request has no tools, does not receive the research report or fetched page content, and is made only after the primary extraction returned the exact expected source set. Local scalar-preservation checks prevent the repair model from adding a title, date, venue, price, quote, verdict, or other fact that was absent from that candidate. A repair failure is recorded; it is never retried and never weakens the canonical event validation.

Override either setting for one run with `--model` and `--effort`, or select another non-secret JSON configuration with `--config`. When testing another model, normally specify both overrides:

```bash
npm run ingest -- --model openai/gpt-oss-20b --effort low --limit 3
npm run ingest -- --config config/ingestion.json --model deepseek/deepseek-v4-flash-0731 --effort high --limit 3
npm run ingest -- --repair-model openai/gpt-5.6-luna --repair-effort medium --limit 3
```

Precedence is independently **CLI override over the selected configuration** for all four settings. Research and extraction use the effective primary pair; repair uses the effective repair pair. Every request sends `reasoning: { effort, exclude: true }`. The model may reason internally, but no reasoning trace is requested or retained. Reasoning tokens count as billable output tokens; an allowlisted provider-reported reasoning-token count is retained when valid and otherwise remains `null`. `OPENAI_MODEL`, effort environment variables, and other model environment variables are not used. The configuration must exist and contain exactly valid `model`, `effort`, `repair_model`, and `repair_effort` fields, even when overriding a value. Missing/malformed files and duplicate CLI flags stop before database, key, or API access. Auto-router model IDs and the deprecated `:online` suffix are rejected, so search stays in the explicitly bounded server tool.

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

1. Review the plan's primary and repair model/effort pairs and agree on a small **separate OpenRouter testing budget**, including hosted search, reasoning output, optional repair, and other model usage. Supplying a key does not itself authorize a live run.
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

The same primary and repair defaults and independent overrides apply in plan and live modes. No live run is launched by the test commands or by viewing the dashboard.

## Bounds and failure behavior

| Limit                      | Current value                                             |
| -------------------------- | --------------------------------------------------------- |
| Retained candidate sources | 1–10; default 10                                          |
| Search interval            | More than zero, at most 31 days                           |
| OpenRouter API requests    | Two primary requests plus at most one conditional repair  |
| Hosted search-tool calls   | At most 3, requested with `max_tool_calls` and `max_uses` |
| Hosted source fetches      | Exactly one per retained source; at most 10               |
| Fetched-page content       | At most 6,000 approximate tokens per fetch                |
| Search results             | At most 5 per search, 15 total                            |
| Search-result content      | At most 2,000 characters per result                       |
| Research output tokens     | At most 6,000                                             |
| Extraction output tokens   | At most 12,000                                            |
| Repair input text          | At most 60,000 characters                                 |
| Repair output tokens       | At most 6,000                                             |
| Research text accepted     | At most 40,000 characters                                 |
| API response body          | At most 1 MiB before JSON parsing                         |
| Provider request timeout   | 120 seconds                                               |
| Database request timeout   | 15 seconds                                                |
| Run cancellation deadline  | 5 minutes, followed by bounded database finalization      |
| Automatic API retries      | None, including quota/rate errors                         |

These are work/request bounds, **not a dollar-accurate billing cap**. OpenRouter may perform several internal model turns while executing hosted tools. Input, model output and hosted search can be billed, even when validation later rejects the result. Check current model/tool pricing and account billing controls before enabling live calls. Offline transport tests verify the requested limits, but live enforcement still needs confirmation. The adapter rejects reported zero/invalid/over-budget search or fetch counts. When a counter is missing, the compatibility checks below verify bounded response evidence rather than inventing a count; enforcement then relies partly on OpenRouter's documented `max_uses`, `max_tool_calls`, required-tool, and domain-filter behavior. Exa remains fixed for search and OpenRouter's direct engine remains fixed for fetch. No credit exhaustion, rate limit or other failure is automatically retried.

The application's requests go only to the fixed `https://openrouter.ai/api/v1/chat/completions` endpoint; redirects are rejected. It never fetches model-provided URLs from the local process. Source access is handled by OpenRouter's hosted search and fetch tools. Fetch is restricted to the Luma, Meetup, and Eventbrite domains, and the request supplies only canonical URLs selected from trusted search annotations. A reported fetch count must exactly match the source count; when absent, exact unique verdict coverage is mandatory. Search reports and fetched pages are treated as untrusted data; model output cannot select database operations or publication status.

Failed or discovery-only observations preserve earlier successful content, retrieval time, and event links. New valid observations update draft facts. Published, archived, and fixture events are not rewritten by the agent. An older observation cannot overwrite a newer one. Conflicting URL/external-ID identities are rejected for review, not automatically merged.

`last_attempt_at` and `last_attempt_error` are distinct from the last successful evidence snapshot. New runs are labeled `openrouter-web-search`, with both selected model/effort pairs saved in `search_parameters` before paid requests. Per-request requested model and effort, returned model, response ID, input/output/reasoning/total token usage, provider-reported cost when present, report, consulted URLs, and summary live in private `search_runs.metadata`. Successful repair metadata is nested under the extraction observation. Missing or malformed reasoning-token usage remains `null`; zero is retained only when explicitly reported. Provider usage and cost are unverified diagnostics. The source stores the latest successful candidate snapshot; it is not an append-only observation history.

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

`provider_diagnostics` in the summary (also saved in private `search_runs.metadata.summary`) contains at most three request snapshots per provider instance: research, extraction, and an optional repair. Each identifies its phase, requested model and effort, HTTP status, bounded response ID and returned model identifier, known finish reason, search/fetch counts, token usage and provider-reported cost when available. For a denied request, it also retains an allowlisted access category and bounded router attempt, endpoint, selected-endpoint, and guardrail-stage counts when OpenRouter reports them. Citation/tool-call counts, extraction candidate count and format, schema-valid candidate count, distinct expected-source matches, duplicate/untrusted source counts, repair-validation stage, and content length describe response structure without saving response text, URLs, prompts, headers, router-pipeline details, tool arguments, fetched content, reasoning traces, or raw errors. Reflected API credentials and key-like identifiers are excluded.

Diagnostics are captured before response validation and included in the final recovery snapshot even when research, extraction, or database finalization fails. A response ID or cost is retained only if actually returned and safely parsed; network errors, non-JSON or oversized responses, and non-success HTTP responses may have no such details. Missing or invalid numbers stay `null`, never zero. These figures are provider reports, not independently verified billing totals.

- `search_usage_missing`: the documented search counter is absent/null and no usable provider citations were returned.
- `search_not_performed`: the counter explicitly reports zero searches.
- Invalid counters still fail response validation; diagnostics mark `search_usage` as `invalid` when a malformed counter is present.
- `source_fetch_usage_missing`: extraction omitted its fetch counter and did not return exact unique verdict coverage for every source.
- `source_fetch_incomplete` / `source_fetch_limit_exceeded`: the reported fetch count did not equal the number of selected listings.

These errors stop extraction and event creation. Inspect diagnostics and account usage before authorizing another paid request. Old failed run records remain unchanged; neither diagnostics nor metadata can reconstruct an earlier discarded research report.

The diagnostic and source-fetch gates pass lint, TypeScript, and the full offline ingestion, unit, dashboard, and review suites, including missing/zero/invalid tool usage, exact candidate-count enforcement, rejected-response cost retention, credential exclusion, and recovery after failed extraction or finalization. No paid retry was performed as part of these fixes.

### Compatibility when Chat Completions omits the search counter

OpenRouter documents `usage.server_tool_use.web_search_requests`, but the second approved Luna response omitted it. Missing is not zero. The adapter now permits two explicit verification paths:

- `search_verification: "usage_counter"`: the response reports between one and three searches. No metadata request is needed.
- `search_verification: "bounded_citations"`: the counter is missing/null and the completed response includes 1–15 provider-generated URL-citation annotations. At least one citation must canonicalize to an individual HTTPS listing on the explicit Luma, Meetup, or Eventbrite allowlist. Other citations do not become candidates. Plain report text alone and excessive or entirely unusable citation sets fail before extraction.

The fallback records `search_usage: "missing"` and `search_tool_calls: null`; it **does not infer query counts from citations, results, or price**. The three-search request limits, two primary requests, optional tool-free repair, extraction schema, source allowlist, draft-only writes, and manual publication requirement remain unchanged. This replaces mandatory query-count reporting with bounded, provider-supplied search evidence when that reporting is unavailable; it is not an independent audit of how many searches the server executed.

The compatibility change is covered by offline regression tests for missing counters, bounded citations, invalid/unsupported citations, excessive results, unchanged API limits, and draft-only persistence. The existing Luna response has exactly the evidence shape this fallback accepts. An explicitly approved end-to-end live check is still needed before claiming live compatibility.

The first end-to-end Luna run after enabling bounded citations successfully persisted three source observations but wrote no event drafts. Inspection found that citation order had selected one background URL absent from the three-event report. Source selection now intersects annotated listing URLs with URLs in the report and preserves report order.

The next run returned all candidates, exposing two further issues: the report said local times lacked an explicit timezone, so extraction left every timestamp null; and two platforms for one event consumed two source slots. Research now requests exactly one primary cited listing in each numbered event section, and source selection enforces one primary listing per section. Extraction applies an explicit ingestion policy: a stated clock time for a verified physical NYC venue is interpreted as `America/New_York`, with the date-correct offset. It still cannot invent a missing date, clock time, or NYC venue, and every result remains a draft requiring review.

The replay after that correction wrote three drafts with no ingestion errors. Independent source review accepted Founders Live NYC and Taco Tech Tuesday, but rejected NYC Startup Founders & Investors Networking Night because the current Meetup page showed September 2 rather than the report's September 9. Extraction now performs bounded hosted fetches of all selected pages and must return a fact-free rejection verdict for any listing whose current core facts conflict with the report.

The first source-fetch replay returned a normal HTTP 200 response with 19,705 tokens and a reported cost of $0.00672044, but Chat Completions omitted `usage.server_tool_use.web_fetch_requests`. The response was discarded before parsing and no event was refreshed. The compatibility path now requires `tool_choice: required`, one allowed fetch slot per source, and a strict response containing each supplied canonical URL exactly once with either a verified verdict or an allowlisted rejection reason. Rejected verdicts must carry no facts. A missing counter with partial, duplicate, invented, or malformed coverage still fails closed; an explicit zero or mismatched counter never uses the fallback.

The next two compatibility replays also returned HTTP 200 without a fetch counter, but their parsed JSON did not expose the expected three-item `candidates` array. Both were rejected as `invalid_extraction_shape` before validation or event writes, at provider-reported costs of $0.00707632 and $0.00630341. The structured-output schema is generated for each request with its candidate array fixed to the exact selected-source count. A contradictory legacy instruction to omit non-event candidates was removed; every supplied source must instead receive a fact-free rejection. Because OpenRouter server tools are beta and these observed responses did not honor the requested envelope, the local parser narrowly accepts the required object, the same array under the schema name, a direct candidate array, or one JSON-encoded copy of those forms. It still requires the exact count, strict candidate schema, canonical source set, unique coverage, and safe verdict rules. Diagnostics record only the envelope category and bounded candidate count when readable, not candidate content.

A later Luna capture showed an exact three-item direct array with the correct unique source set but an older flat fact/quote wire format. The compatibility adapter accepts only that observed exact-key shape, converts its separate fact and quote fields to the canonical nested representation, maps the observed `failed_fetch` label to `source_fetch_failed`, and leaves the absent address unknown. Unknown keys, inconsistent rejected verdicts, unsupported reason labels, and every existing canonical semantic check still fail closed. Diagnostics record whether canonical, legacy-flat, mixed, or invalid candidate formatting was observed without retaining candidate values.

A subsequent Luna response used the same nested fact objects as the canonical schema but legacy names for organizer, venue, and founder relevance. Its relevance value was explanatory text rather than a Boolean. A second exact-key adapter maps non-null relevance evidence to `true`, preserves its supporting quote, maps the renamed fields, and leaves the absent address unknown. The transformed result must still pass the full canonical schema and source-coverage checks. Diagnostics identify this form as `legacy_nested`; no candidate values are retained in safe diagnostics.

Other parsed variants are eligible for one repair request only when their candidate count and exact unique canonical source URLs already match the supplied sources. The configured repair model receives that candidate JSON and the expected URLs, with no search/fetch tools and no report or page content. Its strict-schema response is accepted only when every non-null scalar already occurred in the corresponding original candidate, apart from the allowlisted legacy `failed_fetch` reason mapping. Invalid JSON, partial/duplicate/untrusted coverage, explicit fetch-count failures, invented facts, tool use, or another noncanonical result fail without a second repair.

### Run statuses

- `succeeded`: the bounded run completed without recorded errors; it may legitimately find zero events.
- `partial`: at least one source was saved, but some extraction, validation, or other step failed.
- `failed`: the run could not persist candidates.
- `cancelled`: SIGINT/SIGTERM or the deadline stopped the run.
- `running`: a checkpoint, or a database run interrupted before finalization.

Only `succeeded` exits with code 0. A killed process, power loss, or database outage may leave a run marked `running`; no program can guarantee cleanup after a hard kill. Preserve that record and its local checkpoint. Confirm the original process has stopped, inspect the saved counts/errors, then start a new bounded run. Repeated source ingestion is safe. Do not blindly replay a paid request after an ambiguous timeout; inspect its API usage first.

Common codes:

| Code                                                       | Next action                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `paid_api_not_enabled`                                     | Expected safety gate; approve budget before setting the opt-in                                         |
| `missing_ingestion_environment`                            | Supply the required server-side variables                                                              |
| `invalid_ingestion_config`                                 | Check all four model/effort fields and their explicit OpenRouter model IDs                             |
| `openrouter_key_file_unavailable`                          | Supply a readable, regular `OPENROUTER.key` in the working directory, at most 4 KiB                    |
| `invalid_openrouter_key_file`                              | Use one bare key, without JSON, quotes or a `Bearer` prefix                                            |
| `provider_authentication_failed`                           | OpenRouter returned 401; check the credential locally and never paste it into diagnostics              |
| `provider_access_denied`                                   | OpenRouter returned 403; inspect the safe access category and router counts before another attempt     |
| `search_usage_missing`                                     | Search execution is unknown; inspect safe diagnostics and account usage before another paid attempt    |
| `invalid_search_citation` / `search_result_limit_exceeded` | Provider citations were unsupported or excessive; stop before extraction                               |
| `search_not_performed` / `search_tool_limit_exceeded`      | Zero or excessive searches were reported; inspect model/tool compatibility before another paid attempt |
| `source_fetch_usage_missing`                               | Counter and exact source-verdict coverage are both missing; stop before accepting candidates           |
| `source_fetch_incomplete` / `source_fetch_limit_exceeded`  | Fetch count did not match selected listings; leave sources unlinked and inspect compatibility          |
| `invalid_repair_json` / `invalid_repair_output`            | The one repair response was malformed or could not be proven fact-preserving; do not retry             |
| `repair_input_too_large` / `unexpected_repair_tools`       | The candidate blob exceeded its bound or repair reported tool use; inspect compatibility               |
| `provider_diagnostics_unavailable`                         | The diagnostic snapshot could not be read; inspect the run's other safe errors before retrying         |
| `local_database_required`                                  | Use the local stack, not a hosted project                                                              |
| `ingestion_migration_required`                             | Apply the pending local migration                                                                      |
| `ingestion_preflight_failed`                               | Check the local stack, service-role access, and pending migration before any API spend                 |
| `provider_quota_or_rate_limit`                             | Stop; inspect API quota/billing/rate limits before another paid run                                    |
| `provider_incomplete` / `provider_request_failed`          | Inspect API usage; do not automatically retry                                                          |
| `incomplete_event` / `candidate_missing`                   | Inspect the private source/research report; leave the source unlinked                                  |
| `run_finish_failed`                                        | Use the local checkpoint; the database run may still say running                                       |
| `progress_write_failed`                                    | Local recovery-file write failed; inspect the database summary                                         |

Requests opt into OpenRouter router metadata so a denied request can be distinguished as a guardrail, data-policy, geographic, model-access, account-access, or unknown failure. Diagnostics retain only that category and bounded attempt/endpoint/stage counts. Provider messages, pipeline details, headers, credentials, prompts, source content, and reasoning traces are never stored or printed. A router attempt of zero means OpenRouter did not reach a model provider; it does not by itself identify which access policy denied the request.

## Live source-verification acceptance gate

The isolated repair checkpoint is complete: one Luna request canonicalized the preserved three-candidate response, retained its two usable events and one rejected source, made no searches or database writes, and reported a cost of $0.00208335. The remaining gate is a fresh end-to-end run:

- The September 8–22 run `a1344244-a8ee-4361-bc79-cb0ada11b150` succeeded with two newly discovered Meetup sources, two event drafts, no unlinked sources, and no errors.
- Research used bounded provider citations. Extraction used exact required-tool/source coverage because OpenRouter omitted the fetch counter, then one accepted repair produced two canonical candidates.
- Both original Meetup listings matched the stored titles, dates, times, NYC venue, and founder/investor relevance. Organizer, price, and registration status stayed unknown rather than being inferred. The secondary Eventbrite ticket pages rate-limited independent inspection.
- Both records are nonfixture drafts with source evidence. One began at 7:00 p.m. on September 8 and was persisted about four minutes after it started because the explicitly selected window began at midnight; it should not be published. The September 21 event remained upcoming at review time.
- The three model requests reported $0.03188156 combined cost, including the $0.00172905 repair. Search count and any separate hosted-search cost remain unknown because OpenRouter omitted the search-usage counter.
- Cleanup complete: the already-started event was archived with its source evidence intact, the upcoming event's operator preview had no blockers, and both sandbox-interrupted zero-source runs were marked cancelled with `run_cancelled` audit summaries.
- Repeat run `100aaf50-3dd7-4ff0-ba9d-58b0a5440983` rediscovered the same two URLs, created zero sources, updated both existing source rows, and created no duplicate events. Each URL still has exactly one source row linked to its original event.
- The repeat finished `partial` because Luna changed both candidate relevance verdicts to `false`, producing `irrelevant_event`. The prior event links and successful evidence timestamps were retained, the archived event remained archived, and the upcoming event remained a draft. This validates the failure-preservation boundary while exposing relevance consistency as the next quality issue.
- The repeat's three model requests reported $0.03162429 combined cost. Search count and any separate hosted-search cost remain unknown because OpenRouter again omitted its search-usage counter.
- Still pending: decide whether the warning-bearing upcoming draft should be published and improve relevance consistency before relying on unattended recurring ingestion.

- Review actual request counts, model/tool usage, and cost before expanding the limit.
- Review any real drafts before explicitly authorizing publication to the already-integrated dashboard. Expand to additional providers only after this check passes.
