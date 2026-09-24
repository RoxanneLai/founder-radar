import "server-only";
import { execFile } from "node:child_process";
import { z } from "zod";

const MAX_OUTPUT = 2 * 1024 * 1024;
const uuid = z.string().uuid();
const sourceSchema = z
  .object({
    id: uuid,
    source_name: z.string().max(128),
    source_url: z.string().url().max(2048),
    event_id: uuid.nullable(),
    first_seen_at: z.string().max(64),
    last_seen_at: z.string().max(64),
    last_attempt_at: z.string().max(64).nullable(),
    last_attempt_error: z.string().max(128).nullable(),
  })
  .strict();
const resultSchema = z
  .object({
    run: z
      .object({
        id: uuid,
        provider: z.string().max(128),
        status: z.string().max(32),
        started_at: z.string().max(64),
        completed_at: z.string().max(64).nullable(),
        search_parameters: z.record(z.string(), z.unknown()),
        sources_discovered: z.number().int().nonnegative(),
        sources_created: z.number().int().nonnegative(),
        sources_updated: z.number().int().nonnegative(),
        error_message: z.string().max(256).nullable(),
      })
      .strict(),
    provider_diagnostics: z.array(z.unknown()).max(3),
    sources: z.array(sourceSchema).max(50),
  })
  .strict();

export type InspectionOptions = {
  command: "help" | "inspect";
  runId?: string;
};

export const INSPECTION_HELP = `Inspect one local ingestion run (read-only, no paid APIs):
  npm run ingest:inspect -- --run UUID

No arguments shows this help without connecting. The report includes safe provider
diagnostics and current source linkage, but never source content or raw payloads.`;

/** Parse all input before connecting to the local database. */
export function parseInspectionOptions(args: string[]): InspectionOptions {
  if (!args.length || (args.length === 1 && args[0] === "--help"))
    return { command: "help" };
  if (
    args.length !== 2 ||
    args[0] !== "--run" ||
    !uuid.safeParse(args[1]).success
  )
    throw new Error("Choose exactly one ingestion run with --run UUID.");
  return { command: "inspect", runId: args[1] };
}

function sqlValue(value: string): string {
  return "'" + value.replaceAll("'", "''") + "'";
}

/** Query only bounded run fields, safe diagnostics, and source identities. */
export function inspectionStatement(runId: string): string {
  return `select coalesce((
    select jsonb_build_object(
      'run', jsonb_build_object(
        'id', r.id,
        'provider', r.provider,
        'status', r.status,
        'started_at', r.started_at,
        'completed_at', r.completed_at,
        'search_parameters', r.search_parameters,
        'sources_discovered', r.sources_discovered,
        'sources_created', r.sources_created,
        'sources_updated', r.sources_updated,
        'error_message', r.error_message
      ),
      'provider_diagnostics', coalesce(r.metadata #> '{summary,provider_diagnostics}', '[]'::jsonb),
      'sources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'source_name', s.source_name,
          'source_url', s.source_url,
          'event_id', s.event_id,
          'first_seen_at', s.first_seen_at,
          'last_seen_at', s.last_seen_at,
          'last_attempt_at', s.last_attempt_at,
          'last_attempt_error', s.last_attempt_error
        ) order by s.source_url)
        from public.event_sources s
        where s.discovered_by_run_id = r.id
          or s.source_url in (
            select jsonb_array_elements_text(
              case when jsonb_typeof(r.metadata->'consulted_urls') = 'array'
                then r.metadata->'consulted_urls' else '[]'::jsonb end
            )
          )
      ), '[]'::jsonb)
    ) from public.search_runs r where r.id = ${sqlValue(runId)}::uuid
  ), 'null'::jsonb);`;
}

function runDocker(args: string[], input = ""): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      args,
      { timeout: 20000, maxBuffer: MAX_OUTPUT },
      (error, stdout) => {
        if (error)
          reject(
            new Error(
              "Local ingestion inspection failed. Check Docker and the local Supabase stack.",
            ),
          );
        else resolve(stdout.trim());
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

/** Local Docker only, in a read-only transaction with bounded timeouts. */
export async function executeInspection(
  runId: string,
  run = runDocker,
): Promise<unknown> {
  const endpoint = await run([
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  if (!/^unix:\/\/\/[^\r\n]+$/.test(endpoint))
    throw new Error(
      "Ingestion inspection requires a local Docker Unix socket.",
    );
  const output = await run(
    [
      "--host",
      endpoint,
      "exec",
      "-i",
      "supabase_db_founder-radar",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    `begin read only; set local statement_timeout = '10s'; set local lock_timeout = '5s';\n${inspectionStatement(runId)}\ncommit;`,
  );
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("Local ingestion inspection returned an invalid response.");
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function cost(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** Summarize only provider-reported usage; missing values remain unknown. */
function usageSummary(diagnostics: unknown[]): Record<string, unknown> {
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;
  let reportedCost = 0;
  let inputComplete = true;
  let outputComplete = true;
  let reasoningComplete = true;
  let totalComplete = true;
  let costComplete = true;
  const phases: string[] = [];
  for (const item of diagnostics) {
    const diagnostic = record(item);
    if (typeof diagnostic.phase === "string") phases.push(diagnostic.phase);
    const usage = record(diagnostic.usage);
    const input = count(usage.input_tokens);
    const output = count(usage.output_tokens);
    const reasoning = count(usage.reasoning_tokens);
    const total = count(usage.total_tokens);
    const itemCost = cost(usage.cost);
    if (input === null) inputComplete = false;
    else inputTokens += input;
    if (output === null) outputComplete = false;
    else outputTokens += output;
    if (reasoning === null) reasoningComplete = false;
    else reasoningTokens += reasoning;
    if (total === null) totalComplete = false;
    else totalTokens += total;
    if (itemCost === null) costComplete = false;
    else reportedCost += itemCost;
  }
  return {
    request_count: diagnostics.length,
    phases,
    input_tokens: inputComplete ? inputTokens : null,
    output_tokens: outputComplete ? outputTokens : null,
    reasoning_tokens: reasoningComplete ? reasoningTokens : null,
    total_tokens: totalComplete ? totalTokens : null,
    provider_reported_cost_usd: costComplete ? reportedCost : null,
  };
}

export async function runInspectionCli(
  args: string[],
  execute = executeInspection,
): Promise<unknown> {
  const options = parseInspectionOptions(args);
  if (options.command === "help") return { help: INSPECTION_HELP };
  const parsed = resultSchema.safeParse(await execute(options.runId!));
  if (!parsed.success)
    throw new Error(
      "Invalid local ingestion inspection response; no raw data was printed.",
    );
  return {
    mode: "read_only_ingestion_run",
    run: parsed.data.run,
    usage: usageSummary(parsed.data.provider_diagnostics),
    provider_diagnostics: parsed.data.provider_diagnostics,
    sources: parsed.data.sources,
    source_count: parsed.data.sources.length,
    unlinked_source_count: parsed.data.sources.filter(
      (source) => source.event_id === null,
    ).length,
    paid_requests: 0,
    database_writes: 0,
  };
}
