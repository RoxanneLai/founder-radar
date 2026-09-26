import "server-only";
import { execFile } from "node:child_process";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { z } from "zod";
import { openSqliteDatabase, withImmediateTransaction } from "./sqlite.ts";

const MAX_OUTPUT = 32 * 1024 * 1024;
const row = z.record(z.string(), z.unknown());
const snapshotSchema = z
  .object({
    search_runs: z.array(row).max(10000),
    events: z.array(row).max(10000),
    event_sources: z.array(row).max(20000),
    event_publication_reviews: z.array(row).max(20000),
  })
  .strict();

export type SupabaseSnapshot = z.infer<typeof snapshotSchema>;

const columns = {
  search_runs: [
    "id",
    "agent_name",
    "agent_version",
    "provider",
    "search_parameters",
    "status",
    "started_at",
    "completed_at",
    "sources_discovered",
    "sources_created",
    "sources_updated",
    "error_message",
    "metadata",
    "created_at",
    "updated_at",
  ],
  events: [
    "id",
    "title",
    "organizer_name",
    "starts_at",
    "ends_at",
    "time_zone",
    "venue_name",
    "address_line",
    "neighborhood",
    "borough",
    "city",
    "region",
    "country_code",
    "event_format",
    "categories",
    "price_amount_cents",
    "currency_code",
    "registration_status",
    "publication_status",
    "is_fixture",
    "founder_score",
    "investor_score",
    "networking_score",
    "recommendation",
    "potential_downside",
    "scoring_version",
    "first_seen_at",
    "last_seen_at",
    "published_at",
    "public_registration_url",
    "created_at",
    "updated_at",
  ],
  event_sources: [
    "id",
    "event_id",
    "discovered_by_run_id",
    "source_name",
    "source_kind",
    "external_id",
    "source_url",
    "registration_url",
    "fetched_at",
    "first_seen_at",
    "last_seen_at",
    "last_attempt_at",
    "last_attempt_error",
    "http_status",
    "content_hash",
    "content_text",
    "raw_payload",
    "created_at",
    "updated_at",
  ],
  event_publication_reviews: [
    "id",
    "event_id",
    "source_id",
    "review_token",
    "review_snapshot",
    "approved_at",
    "approved_by_role",
  ],
} as const;

type TableName = keyof typeof columns;

const jsonColumns = new Set([
  "search_parameters",
  "metadata",
  "categories",
  "raw_payload",
  "review_snapshot",
]);
const timestampColumns = new Set([
  "started_at",
  "completed_at",
  "starts_at",
  "ends_at",
  "first_seen_at",
  "last_seen_at",
  "published_at",
  "fetched_at",
  "last_attempt_at",
  "approved_at",
  "created_at",
  "updated_at",
]);

function databaseValue(column: string, value: unknown): SQLInputValue {
  if (jsonColumns.has(column)) return JSON.stringify(value ?? {});
  if (column === "is_fixture") return value === true ? 1 : 0;
  if (timestampColumns.has(column) && typeof value === "string") {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds))
      throw new Error("invalid_supabase_import_snapshot");
    return new Date(milliseconds).toISOString();
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  )
    return value;
  throw new Error("invalid_supabase_import_snapshot");
}

function insertRows(
  database: DatabaseSync,
  table: TableName,
  rows: Array<Record<string, unknown>>,
): void {
  const tableColumns = columns[table];
  const placeholders = tableColumns.map(() => "?").join(",");
  const statement = database.prepare(
    `insert into ${table} (${tableColumns.join(",")}) values (${placeholders})`,
  );
  for (const item of rows)
    statement.run(
      ...tableColumns.map((column) => databaseValue(column, item[column])),
    );
}

/** Import is explicit and refuses every non-empty target. */
export function importSupabaseSnapshot(
  input: unknown,
  sqlitePath: string,
): Record<TableName, number> {
  const snapshot = snapshotSchema.parse(input);
  const database = openSqliteDatabase(sqlitePath);
  try {
    return withImmediateTransaction(database, () => {
      for (const table of Object.keys(columns) as TableName[]) {
        const count = database
          .prepare(`select count(*) as count from ${table}`)
          .get() as {
          count: number;
        };
        if (count.count !== 0)
          throw new Error("sqlite_import_target_not_empty");
      }
      insertRows(database, "search_runs", snapshot.search_runs);
      insertRows(database, "events", snapshot.events);
      insertRows(database, "event_sources", snapshot.event_sources);
      insertRows(
        database,
        "event_publication_reviews",
        snapshot.event_publication_reviews,
      );
      return {
        search_runs: snapshot.search_runs.length,
        events: snapshot.events.length,
        event_sources: snapshot.event_sources.length,
        event_publication_reviews: snapshot.event_publication_reviews.length,
      };
    });
  } finally {
    database.close();
  }
}

function runDocker(args: string[], input = ""): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      args,
      { timeout: 30000, maxBuffer: MAX_OUTPUT },
      (error, stdout) => {
        if (error)
          reject(
            new Error(
              "Supabase export failed. Check local Docker, migrations, and database selection.",
            ),
          );
        else resolve(stdout.trim());
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

const exportStatement = `select jsonb_build_object(
  'search_runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.search_runs r), '[]'::jsonb),
  'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.events e), '[]'::jsonb),
  'event_sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.event_sources s), '[]'::jsonb),
  'event_publication_reviews', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from public.event_publication_reviews v), '[]'::jsonb)
);`;

/** Export from only the local Supabase Docker socket; no hosted credentials. */
export async function readLocalSupabaseSnapshot(
  databaseName = "postgres",
): Promise<SupabaseSnapshot> {
  const endpoint = await runDocker([
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  if (!/^unix:\/\/\/[^\r\n]+$/.test(endpoint))
    throw new Error("Supabase import requires a local Docker Unix socket.");
  const output = await runDocker(
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
      databaseName,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    `begin read only; set local statement_timeout = '20s';\n${exportStatement}\ncommit;`,
  );
  try {
    return snapshotSchema.parse(JSON.parse(output));
  } catch {
    throw new Error("Supabase export returned an invalid private snapshot.");
  }
}
