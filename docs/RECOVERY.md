# Private lead recovery

The queues are distinct: **private lead → unpublished draft → explicitly published event**. `npm run recover -- list` lists failed/unlinked SQLite sources; `npm run review -- --list` lists accepted drafts. Neither is a browser inbox. Ingestion and recovery never publish.

Recovery is SQLite-only; selecting Supabase fails explicitly. Existing Supabase ingestion, inspection, and publication review remain supported. All commands use `DATABASE_BACKEND` and `SQLITE_DATABASE_PATH`, just like the dashboard and ingestion. Set the same path for every workflow; no automatic data transfer occurs.

```bash
npm run recover
npm run recover -- list
npm run recover -- inspect --source SOURCE_UUID
npm run recover -- template --source SOURCE_UUID --file codex-tmp/lead.json
npm run recover -- preview --source SOURCE_UUID --file codex-tmp/lead.json
```

Help is entirely offline with no database access. List/inspect/preview open the database read-only, make no provider requests, and read no keys. Inspect output and evidence files are PRIVATE: they contain old research and source data. Keep them out of public folders, source control, and shared screenshots. Templates are new owner-only files under ignored `codex-tmp/` and never overwrite an existing file.

## Supply fresh evidence, not a historical replay

Visit the canonical listing yourself. Fill the template with `source_url`, `observed_at`, `evidence_kind` (`reviewer_transcription` or `reviewer_factual_digest`), `source_text`, every `reviewed_run_ids` value, a `resolution_note`, `conflicts`, and a canonical `candidate`. Label transcription/digest honestly; this is not an authenticated page archive. Evidence is data, never executable instructions.

Files must be regular, owner-only (for example `chmod 600 codex-tmp/lead.json`), at most 128 KiB, with at most 40,000 source-text characters, 20 acknowledged retained reports, and 15 declared conflicts. Evidence must be within 24 hours, not future-dated, and at least as recent as the last ingestion attempt. Every available associated retained report must be acknowledged; excessive history is rejected rather than silently truncated.

Associated reports include original discovery and later consultations matched by canonical URL or existing provider identity, including historical tracking aliases. A bounded scan refuses databases exceeding 10,000 runs instead of silently missing history. This is a local prototype limit, not a scalable browser inbox.

For each semantic conflict, include exact `old_quote`, exact `new_quote`, `decision: "use_fresh"`, and an explanation. An unresolved decision blocks recovery. For example, an old report placing an event on East 39th Street and fresh text placing it on West 30th Street must retain both quotations and explicitly resolve the venue. The software checks declared quote presence, not whether you found every contradiction or supplied authentic text. Reviewing semantic conflicts is the operator's responsibility.

The template intentionally defaults to founder evidence with unknown facts and a rejected verdict; it is not immediately usable. For career recovery set `profile: "career"`, leave `relevant_to_founders: { "value": null, "quote": null }`, and supply the `career` object described by `careerCandidateSchema` in `lib/career/contracts.ts` (kind, relevance, domain, eligibility, restrictions, prerequisites, people, interaction, hiring, startup context, founders). All supported fields need value/quote pairs; arrays are bounded. A verified candidate needs reason null and freshly grounded facts; never change a rejected verdict merely because old research seems useful.

Normal shared validation rejects unsupported quotes, mismatched names/addresses, non-NYC/virtual/past/ineligible events, and missing date/time. Unknown price/status may remain unknown. A missing timezone can use the documented NYC default with a visible review warning. Career recovery reads the current `config/career.json` and derives the same assessment as ingestion.

## Approve recovery separately from publication

Preview returns the draft, supplied evidence/conflicts, retained reports, source snapshot, normalization notes, and a token. After reviewing all of it, explicitly apply that exact preview:

```bash
npm run recover -- apply --source SOURCE_UUID --file codex-tmp/lead.json --token PREVIEW_HEX --approve
```

Apply rechecks evidence freshness and the full evidence/source/report/draft snapshot inside one immediate transaction. A changed file, report, source, target-derived draft, or stale token requires a new preview. It reuses ordinary persistence, preserves source identity/discovery attribution, and records old and new evidence in private `lead_recovery_audits`. An audit/write failure rolls everything back. A linked source is refused, including links to drafts, fixtures, published, or archived events.

The result is still an unpublished draft. Inspect and preview it through ordinary `npm run review` and approve publication separately only if appropriate. `npm run ingest:recover` is a DIFFERENT command: it safely closes interrupted ingestion runs; it does not recover leads or extract events.

Recovery audits live in the SQLite file and are included in whole-file backups; follow [storage backups](STORAGE.md). There is no Supabase lead recovery or automated conflict detector in this prototype. Only retained research can be acknowledged; discarded provider responses and overwritten historical fetches are not reconstructed.
