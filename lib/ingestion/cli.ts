import "server-only";
import { parseArgs } from "node:util";
import { defaultSearchOptions, validateSearchOptions } from "./options.ts";
import { IngestionError } from "./errors.ts";

export const INGEST_HELP = [
  "FounderRadar ingestion (local database only)",
  "",
  "npm run ingest -- [--from ISO_TIMESTAMP] [--to ISO_TIMESTAMP] [--limit 1..10]",
  "                 [--model vendor/model-id] [--config path/to/config.json]",
  "Default: print a plan only. No network, database writes, or API credentials needed.",
  "Model: --model overrides config/ingestion.json (or --config). No environment model override.",
  "",
  "Add --live AND set FOUNDER_RADAR_ALLOW_PAID_API=1 to permit paid API calls.",
  "Required live environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.",
  "Required live credential file: OPENROUTER.key in the working directory; one bare key.",
  "The command does not automatically load any .env files.",
  "Limits: 2 API requests, up to 3 hosted searches, one hosted fetch per selected source,",
  "        no retries, 5-minute run deadline.",
  "Use --help to show this message. The end timestamp is exclusive.",
].join("\n");

export function parseIngestionArgs(args: string[], now = new Date()) {
  let values;
  try {
    const parsed = parseArgs({
      args,
      tokens: true,
      strict: true,
      allowPositionals: false,
      options: {
        from: { type: "string" },
        to: { type: "string" },
        limit: { type: "string" },
        model: { type: "string" },
        config: { type: "string" },
        live: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
    const names = parsed.tokens
      .filter((token) => token.kind === "option")
      .map((token) => token.name);
    if (new Set(names).size !== names.length)
      throw new Error("duplicate option");
    values = parsed.values;
  } catch {
    throw new IngestionError("invalid_cli_arguments");
  }
  if (values.help) return { help: true as const };
  if (values.model === "" || values.config === "")
    throw new IngestionError("invalid_cli_arguments");
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
  return {
    help: false as const,
    live: values.live === true,
    options,
    model: values.model,
    configPath: values.config,
  };
}
