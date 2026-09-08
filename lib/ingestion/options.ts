import { z } from "zod";
import { IngestionError } from "./errors.ts";
import type { SearchOptions } from "./contracts.ts";

const DAY_MS = 86400000;
const optionsSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    limit: z.number().int().min(1).max(10),
  })
  .strict();

export function defaultSearchOptions(now = new Date()): SearchOptions {
  return {
    from: now.toISOString(),
    to: new Date(now.getTime() + 14 * DAY_MS).toISOString(),
    limit: 10,
  };
}

export function validateSearchOptions(value: unknown): SearchOptions {
  const result = optionsSchema.safeParse(value);
  if (!result.success) throw new IngestionError("invalid_search_options");
  const duration = Date.parse(result.data.to) - Date.parse(result.data.from);
  if (duration <= 0 || duration > 31 * DAY_MS)
    throw new IngestionError("invalid_search_window");
  return result.data;
}
