import "server-only";
import { parseArgs } from "node:util";
import { defaultSearchOptions, validateSearchOptions } from "./options.ts";
import { IngestionError } from "./errors.ts";

export const INGEST_HELP = [
  "FounderRadar ingestion (local database only)",
  "",
  "npm run ingest -- [--from ISO_TIMESTAMP] [--to ISO_TIMESTAMP] [--limit 1..10]",
  "Default: print a plan only. No network, database writes, or API credentials needed.",
  "",
  "Add --live AND set FOUNDER_RADAR_ALLOW_PAID_API=1 to permit paid API calls.",
  "Required live environment: OPENAI_API_KEY, OPENAI_MODEL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.",
  "The command does not automatically load any .env files.",
  "Limits: 2 model requests, 3 search-tool calls, no retries, 5-minute run deadline.",
  "Use --help to show this message. The end timestamp is exclusive.",
].join("\n");

export function parseIngestionArgs(args: string[], now = new Date()) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        from: { type: "string" },
        to: { type: "string" },
        limit: { type: "string" },
        live: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch {
    throw new IngestionError("invalid_cli_arguments");
  }
  if (values.help) return { help: true as const };
  const defaults = defaultSearchOptions(now);
  if ((values.from && !values.to) || (!values.from && values.to))
    throw new IngestionError("provide_both_dates");
  if (values.limit !== undefined && !/^\d+$/.test(values.limit))
    throw new IngestionError("invalid_result_limit");
  const options = validateSearchOptions({
    from: values.from ?? defaults.from,
    to: values.to ?? defaults.to,
    limit: values.limit === undefined ? defaults.limit : Number(values.limit),
  });
  return { help: false as const, live: values.live === true, options };
}
