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
