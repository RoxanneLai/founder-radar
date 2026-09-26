import { resolve } from "node:path";

export type DatabaseBackend = "sqlite" | "supabase";

export type DatabaseSelection =
  { backend: "sqlite"; path: string } | { backend: "supabase" };

export const DEFAULT_SQLITE_DATABASE_PATH = "data/founder-radar.sqlite";

/** One explicit backend setting is shared by every database workflow. */
export function readDatabaseSelection(
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
): DatabaseSelection {
  const rawBackend = env.DATABASE_BACKEND?.trim().toLowerCase();
  const backend = rawBackend || "sqlite";
  if (backend !== "sqlite" && backend !== "supabase")
    throw new Error("invalid_database_backend");
  if (backend === "supabase") return { backend };
  const rawPath = env.SQLITE_DATABASE_PATH?.trim();
  if (env.SQLITE_DATABASE_PATH !== undefined && !rawPath)
    throw new Error("invalid_sqlite_database_path");
  if (rawPath?.includes("\0")) throw new Error("invalid_sqlite_database_path");
  return {
    backend,
    path: resolve(cwd, rawPath || DEFAULT_SQLITE_DATABASE_PATH),
  };
}
