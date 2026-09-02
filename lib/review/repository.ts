import "server-only";
import { execFile } from "node:child_process";
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
export async function executeReview(
  options: ReviewOptions,
  run = runDocker,
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
