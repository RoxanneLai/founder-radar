import "server-only";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readDatabaseSelection } from "../storage/config.ts";
import type {
  ProviderDiagnostic,
  ReasoningEffort,
  SearchOptions,
} from "./contracts.ts";
import { REASONING_EFFORTS } from "./contracts.ts";
import { errorCode } from "./errors.ts";
import { normalizeCandidate } from "./normalize.ts";
import { OpenRouterSearchProvider } from "./openrouter-provider.ts";
import { validateSearchOptions } from "./options.ts";
import { selectSources } from "./sources.ts";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
const MAX_CASES = 20;
const SAFE_CODE = /^[a-z0-9_]{1,64}$/;
const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UnknownRecord = Record<string, unknown>;

const manifestSchema = z
  .object({
    version: z.literal(1),
    cases: z
      .array(
        z
          .object({
            label: z.string().regex(SAFE_LABEL),
            run_id: z.string().regex(UUID),
            capture_context: z.enum([
              "original_failure",
              "follow_up_failure",
              "follow_up_success",
              "unknown",
            ]),
            captures: z.array(z.string().min(1).max(500)).min(1).max(3),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_CASES),
  })
  .strict()
  .superRefine((manifest, context) => {
    const labels = new Set<string>();
    for (const [index, item] of manifest.cases.entries()) {
      if (labels.has(item.label))
        context.addIssue({
          code: "custom",
          path: ["cases", index, "label"],
          message: "duplicate replay label",
        });
      labels.add(item.label);
    }
  });

const captureSchema = z
  .object({
    response_id: z.string().min(1).max(300).nullable().optional(),
    model: z.string().min(1).max(300).nullable().optional(),
    content: z.string().max(MAX_CAPTURE_BYTES),
  })
  .strict();

const storedContextSchema = z
  .object({
    report: z.string().min(1).max(40000),
    urls: z.array(z.string().min(1).max(2048)).min(1).max(10),
    observedAt: z.iso.datetime({ offset: true }),
    options: z
      .object({
        from: z.string(),
        to: z.string(),
        limit: z.number().int(),
        model: z.string().min(3).max(200),
        effort: z.enum(REASONING_EFFORTS),
        repair_model: z.string().min(3).max(200).optional(),
        repair_effort: z.enum(REASONING_EFFORTS).optional(),
      })
      .passthrough(),
    errors: z.array(z.string().regex(SAFE_CODE)).max(50),
  })
  .strict();

type Manifest = z.infer<typeof manifestSchema>;
type ManifestCase = Manifest["cases"][number];
type Capture = z.infer<typeof captureSchema>;
type StoredContext = z.infer<typeof storedContextSchema>;

export type CaptureReplayOptions = {
  command: "help" | "run";
  manifestPath: string | null;
  outputPath: string;
};

export const CAPTURE_REPLAY_HELP = `Replay private provider captures through the current ingestion adapter offline:
  DATABASE_BACKEND=sqlite SQLITE_DATABASE_PATH=data/imported-founder-radar.sqlite \\
    npm run ingest:replay -- run --manifest codex-tmp/capture-replay-manifest.json

Optional output:
  --output codex-tmp/capture-replay-report.json

The manifest and every capture must be inside ignored codex-tmp/. SQLite is opened
read-only. The replay makes no network or paid requests, database writes, publication
changes, or retries. Its report omits run IDs, URLs, event facts, and response text.`;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function safeErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && SAFE_CODE.test(item),
      ),
    ),
  ];
}

function codexTemporaryPath(path: string, cwd: string): string {
  const root = resolve(cwd, "codex-tmp");
  const target = resolve(cwd, path);
  if (target !== root && !target.startsWith(root + sep))
    throw new Error("capture_replay_path_outside_codex_tmp");
  return target;
}

async function existingCodexTemporaryPath(
  path: string,
  cwd: string,
): Promise<string> {
  const root = await realpath(resolve(cwd, "codex-tmp"));
  const target = await realpath(codexTemporaryPath(path, cwd));
  if (target !== root && !target.startsWith(root + sep))
    throw new Error("capture_replay_path_outside_codex_tmp");
  return target;
}

function parseFlag(
  args: string[],
  index: number,
  seen: Set<string>,
): { value: string; next: number } {
  const flag = args[index];
  if (seen.has(flag)) throw new Error("duplicate_capture_replay_argument");
  seen.add(flag);
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error("missing_capture_replay_argument");
  return { value, next: index + 2 };
}

export function parseCaptureReplayOptions(
  args: string[],
  cwd = process.cwd(),
): CaptureReplayOptions {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help"))
    return {
      command: "help",
      manifestPath: null,
      outputPath: resolve(cwd, "codex-tmp/capture-replay-report.json"),
    };
  if (args[0] !== "run") throw new Error("invalid_capture_replay_arguments");
  const seen = new Set<string>();
  let manifestPath: string | null = null;
  let outputPath = "codex-tmp/capture-replay-report.json";
  for (let index = 1; index < args.length;) {
    const flag = args[index];
    if (flag !== "--manifest" && flag !== "--output")
      throw new Error("invalid_capture_replay_arguments");
    const parsed = parseFlag(args, index, seen);
    if (flag === "--manifest") manifestPath = parsed.value;
    else outputPath = parsed.value;
    index = parsed.next;
  }
  if (!manifestPath) throw new Error("missing_capture_replay_manifest");
  if (!outputPath.endsWith(".json"))
    throw new Error("invalid_capture_replay_output");
  return {
    command: "run",
    manifestPath: codexTemporaryPath(manifestPath, cwd),
    outputPath: codexTemporaryPath(outputPath, cwd),
  };
}

async function readBoundedJson(path: string): Promise<unknown> {
  const information = await stat(path);
  if (!information.isFile() || information.size > MAX_CAPTURE_BYTES)
    throw new Error("invalid_capture_replay_file");
  return parseJson(await readFile(path, "utf8"));
}

async function readManifest(path: string, cwd: string): Promise<Manifest> {
  const safePath = await existingCodexTemporaryPath(path, cwd);
  return manifestSchema.parse(await readBoundedJson(safePath));
}

async function readCaptures(
  item: ManifestCase,
  cwd: string,
): Promise<Capture[]> {
  const captures: Capture[] = [];
  for (const path of item.captures) {
    const safePath = await existingCodexTemporaryPath(path, cwd);
    captures.push(captureSchema.parse(await readBoundedJson(safePath)));
  }
  return captures;
}

async function prepareOutputPath(path: string, cwd: string): Promise<string> {
  const root = await realpath(resolve(cwd, "codex-tmp"));
  await mkdir(dirname(path), { recursive: true });
  const parent = await realpath(dirname(path));
  if (parent !== root && !parent.startsWith(root + sep))
    throw new Error("capture_replay_path_outside_codex_tmp");
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("invalid_capture_replay_output");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  return path;
}

function rowErrors(errorMessage: unknown, metadata: unknown): string[] {
  const values: unknown[] = [];
  if (typeof errorMessage === "string") values.push(...errorMessage.split(","));
  const parsedMetadata = parseJson(metadata);
  if (isRecord(parsedMetadata)) {
    const summary = parseJson(parsedMetadata.summary);
    if (isRecord(summary) && Array.isArray(summary.errors))
      values.push(...summary.errors);
  }
  return safeErrors(values);
}

function loadStoredContext(
  database: DatabaseSync,
  runId: string,
): StoredContext {
  const row = database
    .prepare(
      `select started_at, search_parameters, metadata, error_message
       from search_runs where id = ? and agent_name = 'founder-radar-discovery'`,
    )
    .get(runId) as UnknownRecord | undefined;
  if (!row) throw new Error("capture_replay_run_not_found");
  const options = parseJson(row.search_parameters);
  const metadata = parseJson(row.metadata);
  if (!isRecord(metadata)) throw new Error("invalid_capture_replay_context");
  return storedContextSchema.parse({
    report: metadata.research_report,
    urls: metadata.consulted_urls,
    observedAt: row.started_at,
    options,
    errors: rowErrors(row.error_message, metadata),
  });
}

function responseForCapture(capture: Capture, index: number): Response {
  return new Response(
    JSON.stringify({
      id: capture.response_id ?? `offline-capture-${index + 1}`,
      model: capture.model ?? "offline/captured-response",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: capture.content },
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cost: 0,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function safeDiagnostic(diagnostic: ProviderDiagnostic): UnknownRecord {
  return {
    phase: diagnostic.phase,
    extraction_shape: diagnostic.extraction_shape,
    extraction_candidate_count: diagnostic.extraction_candidate_count,
    extraction_schema_valid_count: diagnostic.extraction_schema_valid_count,
    extraction_source_match_count: diagnostic.extraction_source_match_count,
    extraction_candidate_format: diagnostic.extraction_candidate_format,
    repair_scalar_mismatch_count: diagnostic.repair_scalar_mismatch_count,
    repair_validation: diagnostic.repair_validation,
    fetch_verification: diagnostic.fetch_verification ?? null,
    structured_output: diagnostic.structured_output ?? null,
  };
}

function countCodes(codes: Array<string | null>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of codes) {
    const key = code ?? "usable";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function replayCase(
  database: DatabaseSync,
  item: ManifestCase,
  cwd: string,
): Promise<UnknownRecord> {
  const captures = await readCaptures(item, cwd);
  let context: StoredContext;
  try {
    context = loadStoredContext(database, item.run_id);
  } catch {
    return {
      label: item.label,
      capture_context: item.capture_context,
      outcome: "invalid_context",
      original_error_codes: [],
      captures_supplied: item.captures.length,
      captures_consumed: 0,
      captures_unused: item.captures.length,
      provider_request_count: 0,
      candidate_count: null,
      usable_event_count: 0,
      candidate_error_counts: {},
      adapter_error_code: "invalid_capture_replay_context",
      provider_diagnostics: [],
    };
  }
  const options: SearchOptions = validateSearchOptions({
    from: context.options.from,
    to: context.options.to,
    limit: context.options.limit,
  });
  const sources = selectSources(context.urls, options.limit);
  let requestCount = 0;
  let exhausted = false;
  const provider = new OpenRouterSearchProvider(
    "offline-capture-key",
    context.options.model,
    context.options.effort,
    async () => {
      const capture = captures[requestCount++];
      if (!capture) {
        exhausted = true;
        throw new Error("capture_sequence_exhausted");
      }
      return responseForCapture(capture, requestCount - 1);
    },
    context.options.repair_model ?? context.options.model,
    (context.options.repair_effort ??
      context.options.effort) as ReasoningEffort,
  );
  let adapterError: string | null = null;
  let candidateCodes: Array<string | null> = [];
  try {
    const extraction = await provider.extract(
      { report: context.report, urls: context.urls, metadata: {} },
      sources,
      options,
      new AbortController().signal,
    );
    candidateCodes = extraction.candidates.map((candidate, index) => {
      try {
        normalizeCandidate(
          candidate,
          sources[index],
          context.report,
          options,
          context.observedAt,
        );
        return null;
      } catch (error) {
        return errorCode(error);
      }
    });
  } catch (error) {
    adapterError = exhausted ? "capture_sequence_exhausted" : errorCode(error);
  }
  const consumed = Math.min(requestCount, captures.length);
  return {
    label: item.label,
    capture_context: item.capture_context,
    outcome: exhausted
      ? "capture_sequence_exhausted"
      : adapterError
        ? "rejected"
        : "accepted",
    original_error_codes: context.errors,
    source_count: sources.length,
    captures_supplied: captures.length,
    captures_consumed: consumed,
    captures_unused: captures.length - consumed,
    provider_request_count: requestCount,
    candidate_count: adapterError ? null : candidateCodes.length,
    usable_event_count: candidateCodes.filter((code) => code === null).length,
    candidate_error_counts: countCodes(candidateCodes),
    adapter_error_code: adapterError,
    provider_diagnostics: provider.getDiagnostics().map(safeDiagnostic),
  };
}

function summarizeCases(cases: UnknownRecord[]): UnknownRecord {
  const outcomeCounts: Record<string, number> = {};
  const contextCounts: Record<string, number> = {};
  let usableEvents = 0;
  for (const item of cases) {
    const outcome = String(item.outcome);
    const context = String(item.capture_context);
    outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;
    contextCounts[context] = (contextCounts[context] ?? 0) + 1;
    if (typeof item.usable_event_count === "number")
      usableEvents += item.usable_event_count;
  }
  return {
    cases: cases.length,
    outcome_counts: outcomeCounts,
    capture_context_counts: contextCounts,
    exact_original_failure_capture_cases: contextCounts.original_failure ?? 0,
    usable_events_under_current_validation: usableEvents,
  };
}

/** Replay captured responses without network, credentials, or data mutation. */
export async function runCaptureReplayCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<UnknownRecord> {
  const options = parseCaptureReplayOptions(args, cwd);
  if (options.command === "help") return { help: CAPTURE_REPLAY_HELP };
  const selection = readDatabaseSelection(env, cwd);
  if (selection.backend !== "sqlite")
    throw new Error(
      "Offline capture replay supports SQLite only; no backend fallback was attempted.",
    );
  const manifest = await readManifest(options.manifestPath!, cwd);
  const database = new DatabaseSync(selection.path, { readOnly: true });
  const cases: UnknownRecord[] = [];
  try {
    for (const item of manifest.cases)
      cases.push(await replayCase(database, item, cwd));
  } finally {
    database.close();
  }
  const report: UnknownRecord = {
    mode: "offline_captured_response_replay",
    generated_at: new Date().toISOString(),
    summary: summarizeCases(cases),
    cases,
    findings: [
      "Accepted means the current adapter returned candidates; usable events also passed current deterministic event validation.",
      "Only cases marked original_failure replay a response captured from the original failed request.",
      "Follow-up captures measure current compatibility for later diagnostic responses and do not prove that the original failure is fixed.",
    ],
    safety: {
      network_requests: 0,
      paid_requests: 0,
      credential_reads: 0,
      database_writes: 0,
      publication_changes: 0,
      private_content_in_report: false,
    },
  };
  const outputPath = await prepareOutputPath(options.outputPath, cwd);
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
  const summary = report.summary as UnknownRecord;
  return {
    mode: report.mode,
    report_path: relative(cwd, outputPath),
    ...summary,
    safety: report.safety,
  };
}
