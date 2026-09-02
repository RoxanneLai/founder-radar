import { z } from "zod";

const uuid = z.string().uuid();
export type ReviewOptions = {
  command: "help" | "list" | "inspect" | "preview" | "publish";
  eventId?: string;
  sourceId?: string;
  token?: string;
  after?: string;
  approved: boolean;
  database: string;
};

/** Parse all input before connecting; no arguments means offline help. */
export function parseReviewOptions(args: string[]): ReviewOptions {
  const [command = "help", ...rest] = args;
  if (!["help", "list", "inspect", "preview", "publish"].includes(command))
    throw new Error("Use review help, list, inspect, preview, or publish.");
  const values = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (
      ![
        "--event",
        "--source",
        "--token",
        "--after",
        "--database",
        "--approve",
      ].includes(key) ||
      values.has(key)
    )
      throw new Error("Unknown or repeated review option.");
    const value = key === "--approve" ? "true" : rest[++i];
    if (!value || value.startsWith("--"))
      throw new Error("Review option requires a value.");
    values.set(key, value);
  }
  const allowed: Record<string, string[]> = {
    help: [],
    list: ["--database", "--after"],
    inspect: ["--database", "--event"],
    preview: ["--database", "--event", "--source"],
    publish: ["--database", "--event", "--source", "--token", "--approve"],
  };
  if ([...values.keys()].some((key) => !allowed[command].includes(key)))
    throw new Error("That option does not apply to this review command.");
  const eventId = values.get("--event");
  const sourceId = values.get("--source");
  const after = values.get("--after");
  if (
    [eventId, sourceId, after].some(
      (id) => id !== undefined && !uuid.safeParse(id).success,
    )
  )
    throw new Error("Event, source, and cursor values must be UUIDs.");
  if (["inspect", "preview", "publish"].includes(command) && !eventId)
    throw new Error("Choose an event with --event UUID.");
  if (["preview", "publish"].includes(command) && !sourceId)
    throw new Error("Choose the reviewed listing with --source UUID.");
  const token = values.get("--token");
  if (
    command === "publish" &&
    (!values.has("--approve") || !token || !/^[a-f0-9]{64}$/.test(token))
  )
    throw new Error(
      "Publishing requires --approve and the --token from an inspected preview.",
    );
  const database = values.get("--database") ?? "postgres";
  if (
    database !== "postgres" &&
    !/^fr_review_test_[a-f0-9]{16}$/.test(database)
  )
    throw new Error(
      "Review targets only the normal local database or an isolated review test database.",
    );
  return {
    command: command as ReviewOptions["command"],
    eventId,
    sourceId,
    token,
    after,
    approved: values.has("--approve"),
    database,
  };
}
