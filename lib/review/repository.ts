import "server-only";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { publicListingUrl } from "../public-listing-url.ts";
import { readDatabaseSelection } from "../storage/config.ts";
import {
  newId,
  openSqliteDatabase,
  parseJson,
  withImmediateTransaction,
} from "../storage/sqlite.ts";
import type { ReviewOptions } from "./options.ts";

const MAX_OUTPUT = 2 * 1024 * 1024;
const safeErrors: Record<string, string> = {
  review_stale:
    "The event or evidence changed. Inspect a fresh preview before approving again.",
  review_event_missing: "The selected event no longer exists.",
  review_source_missing: "The selected source is not linked to this event.",
  review_not_draft: "Only non-fixture drafts can be published.",
  review_not_visible:
    "The event is outside the upcoming NYC feed or is cancelled.",
  review_evidence_required:
    "Successful source evidence is required; resolve the failed or missing observation first.",
  review_link_invalid:
    "The selected listing cannot supply a safe public registration link.",
  review_approval_required: "Explicit publication approval is required.",
  review_too_many_sources:
    "This event exceeds the 25-source review limit; review its source links manually.",
};

type DockerRunner = (args: string[], input?: string) => Promise<string>;

function runDocker(args: string[], input = ""): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      args,
      { timeout: 20000, maxBuffer: MAX_OUTPUT },
      (error, stdout, stderr) => {
        if (error) {
          const code = Object.keys(safeErrors).find((key) =>
            stderr.includes(key),
          );
          reject(
            new Error(
              code
                ? safeErrors[code]
                : "Local review operation failed. Check Docker and pending migrations. For a publish attempt, inspect the event before retrying: its outcome may be uncertain.",
            ),
          );
        } else resolve(stdout.trim());
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

function sqlValue(value: string | undefined): string {
  return value === undefined ? "null" : "'" + value.replaceAll("'", "''") + "'";
}

/** Return fixed statements only; values are quoted even after CLI validation. */
export function reviewStatement(options: ReviewOptions): string {
  if (options.command === "list") {
    return `select coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) from (
      select id, title, starts_at, updated_at from public.events
      where publication_status = 'draft' and not is_fixture
      and (${sqlValue(options.after)}::uuid is null or id > ${sqlValue(options.after)}::uuid)
      order by id limit 21) d;`;
  }
  if (options.command === "publish") {
    if (!options.approved || !options.token)
      throw new Error(safeErrors.review_approval_required);
    return `select public.publish_reviewed_event(${sqlValue(options.eventId)}::uuid,
      ${sqlValue(options.sourceId)}::uuid, ${sqlValue(options.token)}, true);`;
  }
  if (options.command === "inspect" || options.command === "preview")
    return `select public.get_event_review(${sqlValue(options.eventId)}::uuid, ${sqlValue(options.sourceId)}::uuid);`;
  throw new Error("Help does not access the database.");
}

/** Local Unix-socket Docker only; no service key, hosted DB, shell, or automatic retry. */
export async function executeSupabaseReview(
  options: ReviewOptions,
  run: DockerRunner = runDocker,
): Promise<unknown> {
  const statement = reviewStatement(options);
  const endpoint = await run([
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  if (!/^unix:\/\/\/[^\r\n]+$/.test(endpoint))
    throw new Error(
      "Review requires a local Docker Unix socket, not a remote Docker context.",
    );
  const mode = options.command === "publish" ? "" : "read only";
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
      options.database,
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
      "Local review returned an invalid response; no raw database output was printed.",
    );
  }
}

function sqliteEvent(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    categories: parseJson(row.categories),
    is_fixture: row.is_fixture === 1,
  };
}

function sqliteSource(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, raw_payload: parseJson(row.raw_payload) };
}

function sqliteReview(
  database: DatabaseSync,
  eventId: string,
  sourceId?: string,
): Record<string, unknown> {
  const eventRow = database
    .prepare("select * from events where id = ?")
    .get(eventId);
  if (!eventRow) throw new Error(safeErrors.review_event_missing);
  const sourceRows = database
    .prepare(
      "select * from event_sources where event_id = ? order by id limit 26",
    )
    .all(eventId);
  if (sourceRows.length > 25)
    throw new Error(safeErrors.review_too_many_sources);
  const sources = sourceRows.map(sqliteSource);
  const selected = sourceId
    ? sources.find((source) => source.id === sourceId)
    : undefined;
  const publicUrl = selected
    ? publicListingUrl(String(selected.source_url))
    : null;
  const snapshot = {
    event: sqliteEvent(eventRow),
    sources,
    selected_source_id: sourceId ?? null,
    public_registration_url: publicUrl,
  };
  const reviewToken = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
  return { ...snapshot, review_token: reviewToken };
}

function publishSqliteReview(
  database: DatabaseSync,
  options: ReviewOptions,
  now: Date,
): Record<string, unknown> {
  if (
    !options.approved ||
    !options.eventId ||
    !options.sourceId ||
    !options.token
  )
    throw new Error(safeErrors.review_approval_required);
  return withImmediateTransaction(database, () => {
    const review = sqliteReview(database, options.eventId!, options.sourceId);
    if (review.review_token !== options.token)
      throw new Error(safeErrors.review_stale);
    const event = review.event as Record<string, unknown>;
    const sources = review.sources as Array<Record<string, unknown>>;
    const source = sources.find((item) => item.id === options.sourceId);
    if (!source) throw new Error(safeErrors.review_source_missing);
    if (event.publication_status !== "draft" || event.is_fixture === true)
      throw new Error(safeErrors.review_not_draft);
    const startsAt = Date.parse(String(event.starts_at));
    if (
      event.city !== "New York" ||
      event.region !== "NY" ||
      event.country_code !== "US" ||
      event.time_zone !== "America/New_York" ||
      !["in-person", "hybrid"].includes(String(event.event_format)) ||
      event.registration_status === "cancelled" ||
      !Number.isFinite(startsAt) ||
      startsAt <= now.getTime() ||
      startsAt >= now.getTime() + 30 * 86400000
    )
      throw new Error(safeErrors.review_not_visible);
    if (
      typeof source.content_text !== "string" ||
      !source.content_text.trim() ||
      !source.fetched_at ||
      source.last_attempt_error !== null
    )
      throw new Error(safeErrors.review_evidence_required);
    const publicUrl = review.public_registration_url;
    if (typeof publicUrl !== "string")
      throw new Error(safeErrors.review_link_invalid);
    const approvedAt = now.toISOString();
    database
      .prepare(
        `insert into event_publication_reviews (
          id, event_id, source_id, review_token, review_snapshot, approved_at, approved_by_role
        ) values (?, ?, ?, ?, ?, ?, 'local_operator')`,
      )
      .run(
        newId(),
        options.eventId!,
        options.sourceId!,
        options.token!,
        JSON.stringify(review),
        approvedAt,
      );
    database
      .prepare(
        `update events set publication_status = 'published', published_at = ?,
         public_registration_url = ?, updated_at = ? where id = ?`,
      )
      .run(approvedAt, publicUrl, approvedAt, options.eventId!);
    return {
      event_id: options.eventId,
      publication_status: "published",
      public_registration_url: publicUrl,
    };
  });
}

export function executeSqliteReview(
  options: ReviewOptions,
  path: string,
  now = new Date(),
): unknown {
  const database = openSqliteDatabase(path);
  try {
    if (options.command === "list")
      return database
        .prepare(
          `select id, title, starts_at, updated_at from events
           where publication_status = 'draft' and is_fixture = 0
           and (? is null or id > ?) order by id limit 21`,
        )
        .all(options.after ?? null, options.after ?? null);
    if (options.command === "inspect" || options.command === "preview")
      return sqliteReview(database, options.eventId!, options.sourceId);
    if (options.command === "publish")
      return publishSqliteReview(database, options, now);
    throw new Error("Help does not access the database.");
  } finally {
    database.close();
  }
}

/** Dispatch every review command through the one shared backend selection. */
export async function executeReview(
  options: ReviewOptions,
  run?: DockerRunner,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  if (run) return executeSupabaseReview(options, run);
  const selection = readDatabaseSelection(env);
  if (selection.backend === "sqlite")
    return executeSqliteReview(options, selection.path);
  return executeSupabaseReview(options);
}
