# Offline ingestion-quality evaluation

## Purpose

The evaluation command measures where the local ingestion pipeline is losing useful results before more prompting, parser, or model work is authorized. It combines the selected SQLite database's allowlisted run summaries with matching ignored `codex-tmp/ingestion-<run-id>.json` checkpoints. It never loads research reports, source text, raw payloads, prompts, credentials, or reasoning traces.

It is descriptive, not a live model benchmark. Historical runs span different prompts, schemas, compatibility code, and model settings. The report therefore includes both the complete history and a clearly labeled latest-five-terminal-run cohort. It does not claim that old and new runs are directly comparable.

## Run it

Use the SQLite database whose history you want to inspect:

```bash
DATABASE_BACKEND=sqlite \
SQLITE_DATABASE_PATH=data/imported-founder-radar.sqlite \
npm run ingest:evaluate -- run
```

Optional local paths must remain under ignored `codex-tmp/`:

```bash
DATABASE_BACKEND=sqlite \
SQLITE_DATABASE_PATH=data/imported-founder-radar.sqlite \
npm run ingest:evaluate -- run \
  --checkpoints codex-tmp \
  --output codex-tmp/ingestion-quality-report.json
```

No arguments prints help before database or checkpoint access. The evaluator rejects Supabase rather than silently switching backends. It opens SQLite read-only and writes only the requested owner-readable report file. It makes no network or paid requests, retries, database writes, or publication changes.

## Metric definitions

| Metric                      | Meaning                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Candidate-slot fill rate    | Discovered sources, capped at each run's requested limit, divided by requested candidate slots            |
| Usable draft writes         | Inserted or refreshed draft writes reported by terminal runs; not necessarily unique newly created events |
| Draft-write rate            | Usable draft writes divided by discovered source observations                                             |
| Loss categories             | Safe errors grouped into discovery, provider, verification, response-shape, eligibility, or validation    |
| Repair-run rate             | Runs containing an observed repair request divided by runs with request diagnostics                       |
| Cost per usable draft write | Provider-reported cost from cost-complete runs divided by their usable draft writes                       |
| Source error counts         | Each source row's latest attempt result, not an append-only history                                       |

Costs and token totals are unverified provider diagnostics. Missing values remain missing instead of being inferred as zero. Aggregate output includes no run IDs, source URLs, event facts, or private text.

## September 27, 2026 checkpoint

The first report evaluated 40 OpenRouter discovery runs in the imported SQLite history. All 33 terminal runs had a safe summary; 28 also matched ignored checkpoint files. Seven records remained marked `running` and require individual confirmation through `ingest:recover` before any cancellation.

Across the full history, runs filled 67 of 99 requested candidate slots (67.7%) and reported 11 usable draft writes from 67 discovered-source observations (16.4%). Twenty-six runs had complete provider-reported cost fields; their reported total was $0.52772985, or $0.04797544 per usable draft write. These are historical development costs, not a forecast of the current pipeline.

The latest five terminal runs are more relevant to the current implementation: four were partial and one succeeded; they discovered 9 of 15 requested candidates (60.0%), produced one usable draft write (11.1% of discovered-source observations), and used repair in three of five diagnostic-covered runs. Their error summaries contained two `invalid_repair_output` and two `invalid_extraction_shape` results, so all four recent recorded losses fall into the `response_shape` category. The newest successful run demonstrates that generalized repair now handles one of those unfamiliar shapes; a captured-response replay is needed before assuming that every historical response-shape failure still applies.

The report's evidence-based order is:

1. Preview the seven `running` records and close only those confirmed interrupted.
2. Replay preserved recent response-shape failures through the current offline parser and repair boundary.
3. Compare bounded discovery-query strategies on one fixed window because recent runs filled only 60% of requested slots.
4. Continue tracking structured-output compatibility because 60% of the recent cohort used repair.

Manual comparison of accepted drafts with their canonical listing pages remains outside this automated report and is still required before publication.

## Replay preserved responses offline

Use the capture replayer to test private, previously saved provider responses against the current extraction, compatibility, repair, and deterministic validation code. The manifest and captures stay under ignored `codex-tmp/`; the generated report is owner-readable and contains no run IDs, URLs, event facts, research text, or response text.

```bash
DATABASE_BACKEND=sqlite \
SQLITE_DATABASE_PATH=data/imported-founder-radar.sqlite \
npm run ingest:replay -- run \
  --manifest codex-tmp/capture-replay-manifest.json
```

The strict manifest format is:

```json
{
  "version": 1,
  "cases": [
    {
      "label": "recent-shape-failure",
      "run_id": "00000000-0000-4000-8000-000000000000",
      "capture_context": "original_failure",
      "captures": ["codex-tmp/private-response.json"]
    }
  ]
}
```

`capture_context` must be `original_failure`, `follow_up_failure`, `follow_up_success`, or `unknown`. This distinction is essential: a later diagnostic response can show that the current adapter handles that later response, but it cannot prove that an unpreserved original failure is fixed. Supply a second capture only when it is the repair response paired with the first extraction response.

No arguments prints help before database or capture access. The command rejects Supabase, paths outside `codex-tmp/`, malformed manifests, oversized captures, and incomplete capture sequences. It opens SQLite read-only, uses a local response substitute rather than `fetch`, reads no credentials, and makes no network requests, paid calls, database writes, publication changes, or retries.

The September 29 replay contained three preserved cases. All three were accepted by the current adapter, producing four candidates that also passed current deterministic event validation. The one exact original-failure capture now yields two usable candidates and one explicit `source_fetch_failed` rejection from its three source verdicts, without invoking repair. A later three-source diagnostic also yields two usable candidates and one explicit cancellation rejection without repair. The final one-source diagnostic is structurally accepted but remains intentionally unusable because it reports insufficient source evidence. Only the first case is an exact original-failure capture; the other two are follow-up diagnostics, and original responses for the other recent failures were not retained.
