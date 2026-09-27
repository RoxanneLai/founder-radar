import "server-only";
import { execFile } from "node:child_process";
import { z } from "zod";
import { readDatabaseSelection } from "../storage/config.ts";
import {
  openSqliteDatabase,
  parseJson,
  withImmediateTransaction,
} from "../storage/sqlite.ts";

const MAX_OUTPUT = 2 * 1024 * 1024;
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const runSchema = z
  .object({
    id: uuid,
    provider: z.string().min(1).max(128),
    status: z.enum(["running", "cancelled"]),
    started_at: timestamp,
    completed_at: timestamp.nullable(),
    sources_discovered: z.number().int().nonnegative(),
    sources_created: z.number().int().nonnegative(),
    sources_updated: z.number().int().nonnegative(),
    error_message: z.string().max(256).nullable(),
    updated_at: timestamp,
  })
  .strict();

export type RecoveryOptions = {
  command: "help" | "list" | "preview" | "cancel";
  runId?: string;
  revision?: string;
  approved: boolean;
  recoveredAt?: string;
};

type DockerRunner = (args: string[], input?: string) => Promise<string>;

export const RECOVERY_HELP = `Recover an interrupted local ingestion run (no paid APIs):
  npm run ingest:recover -- list
  npm run ingest:recover -- preview --run UUID
  npm run ingest:recover -- cancel --run UUID --revision TIMESTAMP --approve

List and preview are read-only. Confirm the original process has stopped, inspect its
saved checkpoint and provider usage, then copy the exact revision from preview.
Cancel preserves the run, metadata, sources, and events; it only closes a still-running
unchanged run with a run_cancelled audit marker. There are no automatic retries.`;

/** Parse and validate every option before opening a database connection. */
export function parseRecoveryOptions(args: string[]): RecoveryOptions {
  const [command = "help", ...rest] = args;
  if (!["help", "list", "preview", "cancel"].includes(command))
    throw new Error("Use recovery help, list, preview, or cancel.");
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index++) {
    const key = rest[index];
    if (!["--run", "--revision", "--approve"].includes(key) || values.has(key))
      throw new Error("Unknown or repeated recovery option.");
    const value = key === "--approve" ? "true" : rest[++index];
    if (!value || value.startsWith("--"))
      throw new Error("Recovery option requires a value.");
    values.set(key, value);
  }
  const allowed: Record<string, string[]> = {
    help: [],
    list: [],
    preview: ["--run"],
    cancel: ["--run", "--revision", "--approve"],
  };
  if ([...values.keys()].some((key) => !allowed[command].includes(key)))
    throw new Error("That option does not apply to this recovery command.");
  const runId = values.get("--run");
  if (runId !== undefined && !uuid.safeParse(runId).success)
    throw new Error("Run values must be UUIDs.");
  if (["preview", "cancel"].includes(command) && !runId)
    throw new Error("Choose one interrupted run with --run UUID.");
  const revision = values.get("--revision");
  if (revision !== undefined && !timestamp.safeParse(revision).success)
    throw new Error("Recovery revisions must be ISO timestamps.");
  if (
    command === "cancel" &&
    (!values.has("--approve") || revision === undefined)
  )
    throw new Error(
      "Cancelling requires --approve and the --revision from a fresh preview.",
    );
  return {
    command: command as RecoveryOptions["command"],
    runId,
    revision,
    approved: values.has("--approve"),
  };
}

function sqlValue(value: string | undefined): string {
  return value === undefined ? "null" : "'" + value.replaceAll("'", "''") + "'";
}

function runProjection(alias: string): string {
  return `jsonb_build_object(
    'id', ${alias}.id,
    'provider', ${alias}.provider,
    'status', ${alias}.status,
    'started_at', ${alias}.started_at,
    'completed_at', ${alias}.completed_at,
    'sources_discovered', ${alias}.sources_discovered,
    'sources_created', ${alias}.sources_created,
    'sources_updated', ${alias}.sources_updated,
    'error_message', ${alias}.error_message,
    'updated_at', ${alias}.updated_at
  )`;
}

/** Fixed local SQL; cancellation is atomic and revision-checked. */
export function recoveryStatement(options: RecoveryOptions): string {
  if (options.command === "list")
    return `select coalesce(jsonb_agg(${runProjection("r")} order by r.started_at desc), '[]'::jsonb)
      from (select * from public.search_runs where status = 'running'
      order by started_at desc limit 20) r;`;
  if (options.command === "preview")
    return `select coalesce((select ${runProjection("r")} from public.search_runs r
      where r.id = ${sqlValue(options.runId)}::uuid and r.status = 'running'), 'null'::jsonb);`;
  if (options.command === "cancel") {
    if (!options.approved || !options.revision)
      throw new Error(
        "Cancelling requires explicit approval and a fresh revision.",
      );
    const recoveredAt = options.recoveredAt ?? new Date().toISOString();
    return `with recovered as (
      update public.search_runs set
        status = 'cancelled',
        completed_at = ${sqlValue(recoveredAt)}::timestamptz,
        error_message = case when error_message is null or error_message = ''
          then 'run_cancelled'
          when position('run_cancelled' in error_message) > 0 then error_message
          else error_message || ', run_cancelled' end,
        metadata = metadata || jsonb_build_object('operator_recovery', jsonb_build_object(
          'action', 'cancelled_interrupted_run', 'recovered_at', ${sqlValue(recoveredAt)}::text)),
        updated_at = ${sqlValue(recoveredAt)}::timestamptz
      where id = ${sqlValue(options.runId)}::uuid and status = 'running'
        and updated_at = ${sqlValue(options.revision)}::timestamptz
      returning *)
      select coalesce((select ${runProjection("r")} from recovered r), 'null'::jsonb);`;
  }
  throw new Error("Help does not access the database.");
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
              "Local ingestion recovery failed. Check Docker and the local Supabase stack.",
            ),
          );
        else resolve(stdout.trim());
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

/** Supabase recovery is restricted to the existing local Docker database. */
export async function executeSupabaseRecovery(
  options: RecoveryOptions,
  run: DockerRunner = runDocker,
): Promise<unknown> {
  const statement = recoveryStatement(options);
  const endpoint = await run([
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  if (!/^unix:\/\/\/[^\r\n]+$/.test(endpoint))
    throw new Error("Ingestion recovery requires a local Docker Unix socket.");
  const mode = options.command === "cancel" ? "" : "read only";
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
    `begin ${mode}; set local statement_timeout = '10s'; set local lock_timeout = '5s';\n${statement}\ncommit;`,
  );
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(
      "Local ingestion recovery returned an invalid response without exposing it.",
    );
  }
}

function safeSqliteRun(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    sources_discovered: row.sources_discovered,
    sources_created: row.sources_created,
    sources_updated: row.sources_updated,
    error_message: row.error_message,
    updated_at: row.updated_at,
  };
}

function sqliteRun(
  database: ReturnType<typeof openSqliteDatabase>,
  runId: string,
): Record<string, unknown> | undefined {
  const row = database
    .prepare(
      `select id, provider, status, started_at, completed_at, sources_discovered,
       sources_created, sources_updated, error_message, updated_at, metadata
       from search_runs where id = ?`,
    )
    .get(runId);
  return row ? (row as Record<string, unknown>) : undefined;
}

/** SQLite cancellation preserves all rows and adds a bounded audit marker. */
export function executeSqliteRecovery(
  options: RecoveryOptions,
  path: string,
): unknown {
  const database = openSqliteDatabase(path);
  try {
    if (options.command === "list")
      return database
        .prepare(
          `select id, provider, status, started_at, completed_at, sources_discovered,
           sources_created, sources_updated, error_message, updated_at
           from search_runs where status = 'running'
           order by started_at desc limit 20`,
        )
        .all();
    if (options.command === "preview") {
      const row = sqliteRun(database, options.runId!);
      return row?.status === "running" ? safeSqliteRun(row) : null;
    }
    if (options.command === "cancel") {
      if (!options.approved || !options.revision)
        throw new Error(
          "Cancelling requires explicit approval and a fresh revision.",
        );
      const runId = options.runId!;
      const revision = options.revision;
      return withImmediateTransaction(database, () => {
        const row = sqliteRun(database, runId);
        if (!row || row.status !== "running" || row.updated_at !== revision)
          throw new Error(
            "The run changed or is no longer running. Preview it again.",
          );
        const recoveredAt = options.recoveredAt ?? new Date().toISOString();
        const parsedMetadata = parseJson(row.metadata);
        const metadata =
          parsedMetadata &&
          typeof parsedMetadata === "object" &&
          !Array.isArray(parsedMetadata)
            ? parsedMetadata
            : {};
        const priorError =
          typeof row.error_message === "string" ? row.error_message : "";
        const errorMessage = priorError.includes("run_cancelled")
          ? priorError
          : priorError
            ? priorError + ", run_cancelled"
            : "run_cancelled";
        const result = database
          .prepare(
            `update search_runs set status = 'cancelled', completed_at = ?,
             error_message = ?, metadata = ?, updated_at = ?
             where id = ? and status = 'running' and updated_at = ?`,
          )
          .run(
            recoveredAt,
            errorMessage,
            JSON.stringify({
              ...metadata,
              operator_recovery: {
                action: "cancelled_interrupted_run",
                recovered_at: recoveredAt,
              },
            }),
            recoveredAt,
            runId,
            revision,
          );
        if (result.changes !== 1)
          throw new Error(
            "The run changed or is no longer running. Preview it again.",
          );
        return safeSqliteRun(sqliteRun(database, runId)!);
      });
    }
    throw new Error("Help does not access the database.");
  } finally {
    database.close();
  }
}

/** Dispatch through the shared backend; there is no silent fallback. */
export async function executeRecovery(
  options: RecoveryOptions,
  run?: DockerRunner,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  if (run) return executeSupabaseRecovery(options, run);
  const selection = readDatabaseSelection(env);
  if (selection.backend === "sqlite")
    return executeSqliteRecovery(options, selection.path);
  return executeSupabaseRecovery(options);
}

export async function runRecoveryCli(
  args: string[],
  execute = executeRecovery,
  now = new Date(),
): Promise<unknown> {
  const parsed = parseRecoveryOptions(args);
  if (parsed.command === "help") return { help: RECOVERY_HELP };
  const options =
    parsed.command === "cancel"
      ? { ...parsed, recoveredAt: now.toISOString() }
      : parsed;
  const result = await execute(options);
  if (options.command === "list") {
    const runs = z.array(runSchema).max(20).safeParse(result);
    if (!runs.success)
      throw new Error(
        "Invalid recovery list response; no raw data was printed.",
      );
    return {
      mode: "interrupted_run_list",
      running_runs: runs.data,
      count: runs.data.length,
      paid_requests: 0,
      database_writes: 0,
    };
  }
  const run = runSchema.safeParse(result);
  if (!run.success)
    throw new Error(
      options.command === "cancel"
        ? "The run changed or is no longer running. Preview it again."
        : "That ingestion run does not exist or returned invalid recovery data.",
    );
  if (options.command === "preview")
    return {
      mode: "interrupted_run_recovery_preview",
      run: run.data,
      revision: run.data.updated_at,
      warning:
        "Confirm the original process stopped and inspect provider usage before approving cancellation.",
      paid_requests: 0,
      database_writes: 0,
    };
  return {
    mode: "interrupted_run_cancelled",
    run: run.data,
    paid_requests: 0,
    database_writes: 1,
  };
}
