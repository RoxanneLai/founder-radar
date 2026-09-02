import "server-only";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { IngestionError } from "./errors.ts";

export const DEFAULT_CONFIG_PATH = "config/ingestion.json";
export const OPENROUTER_KEY_PATH = "OPENROUTER.key";

const modelSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
  .refine(
    (value) =>
      !value.toLowerCase().split(":").includes("online") &&
      !value.toLowerCase().startsWith("openrouter/"),
  );
const settingsSchema = z.object({ model: modelSchema }).strict();

/** Read a small regular file only; never echo file contents or filesystem errors. */
async function readLocalText(
  path: string,
  limit: number,
  code: string,
): Promise<string> {
  try {
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > limit) throw new IngestionError(code);
      const buffer = Buffer.alloc(limit + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          size,
          buffer.length - size,
          null,
        );
        if (bytesRead === 0) break;
        size += bytesRead;
      }
      if (size > limit) throw new IngestionError(code);
      return buffer.subarray(0, size).toString("utf8");
    } finally {
      await file.close();
    }
  } catch {
    throw new IngestionError(code);
  }
}

/** CLI model wins over the checked-in configuration; secrets are never read here. */
export async function readModelConfig(
  path = DEFAULT_CONFIG_PATH,
  modelOverride?: string,
): Promise<{ model: string }> {
  const text = await readLocalText(path, 16384, "invalid_ingestion_config");
  try {
    const settings = settingsSchema.parse(JSON.parse(text));
    return { model: modelSchema.parse(modelOverride ?? settings.model) };
  } catch {
    throw new IngestionError("invalid_ingestion_config");
  }
}

/** Only the live CLI calls this; the file contains one bare API key, not JSON. */
export async function readOpenRouterKey(
  path = OPENROUTER_KEY_PATH,
): Promise<string> {
  const key = (
    await readLocalText(path, 4096, "openrouter_key_file_unavailable")
  ).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(key))
    throw new IngestionError("invalid_openrouter_key_file");
  return key;
}
