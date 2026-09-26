import "server-only";
import { readDatabaseSelection } from "../storage/config.ts";
import { IngestionError } from "./errors.ts";

export type IngestionConfig =
  | { backend: "sqlite"; path: string }
  | { backend: "supabase"; supabaseUrl: string; serviceRoleKey: string };

/** Secrets come only from the caller's environment, never from browser variables. */
export function readIngestionConfig(env: NodeJS.ProcessEnv): IngestionConfig {
  if (env.FOUNDER_RADAR_ALLOW_PAID_API !== "1")
    throw new IngestionError("paid_api_not_enabled");
  let selection;
  try {
    selection = readDatabaseSelection(env);
  } catch {
    throw new IngestionError("invalid_database_configuration");
  }
  if (selection.backend === "sqlite") return selection;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = env.SUPABASE_URL?.trim();
  if (!serviceRoleKey || !supabaseUrl)
    throw new IngestionError("missing_ingestion_environment");
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new IngestionError("invalid_database_url");
  }
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !url.port
  ) {
    throw new IngestionError("local_database_required");
  }
  return { backend: "supabase", serviceRoleKey, supabaseUrl: url.origin };
}
