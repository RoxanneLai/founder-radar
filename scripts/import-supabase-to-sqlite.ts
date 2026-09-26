import { resolve } from "node:path";
import {
  importSupabaseSnapshot,
  readLocalSupabaseSnapshot,
} from "../lib/storage/supabase-import.ts";

function parseArguments(args: string[]): { path: string; database: string } {
  let path: string | undefined;
  let database = "postgres";
  let databaseSelected = false;
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error("invalid_import_arguments");
    if (key === "--to" && path === undefined) path = value;
    else if (key === "--database" && !databaseSelected) {
      database = value;
      databaseSelected = true;
    } else throw new Error("invalid_import_arguments");
  }
  if (!path || path.includes("\0") || !/^[A-Za-z0-9_-]+$/.test(database))
    throw new Error("invalid_import_arguments");
  return { path: resolve(path), database };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const snapshot = await readLocalSupabaseSnapshot(options.database);
  const imported = importSupabaseSnapshot(snapshot, options.path);
  console.log(
    JSON.stringify(
      { mode: "explicit_supabase_to_sqlite_import", imported },
      null,
      2,
    ),
  );
}

main().catch(() => {
  console.error(
    "Import stopped safely. The target must be an empty SQLite database and local Supabase must be available.",
  );
  process.exitCode = 1;
});
