import { mkdir, writeFile } from "node:fs/promises";
import { parseIngestionArgs, INGEST_HELP } from "../lib/ingestion/cli.ts";
import { readIngestionConfig } from "../lib/ingestion/config.ts";
import { errorCode } from "../lib/ingestion/errors.ts";
import {
  API_LIMITS,
  createOpenAIProvider,
} from "../lib/ingestion/openai-provider.ts";
import { createIngestionRepository } from "../lib/ingestion/repository.ts";
import { runIngestion } from "../lib/ingestion/run.ts";
import type { RunSummary } from "../lib/ingestion/contracts.ts";

async function saveProgress(summary: RunSummary): Promise<void> {
  await mkdir("codex-tmp", { recursive: true });
  await writeFile(
    "codex-tmp/ingestion-" + summary.run_id + ".json",
    JSON.stringify(summary, null, 2) + "\n",
  );
}

async function main(): Promise<void> {
  const args = parseIngestionArgs(process.argv.slice(2));
  if (args.help) {
    console.log(INGEST_HELP);
    return;
  }
  if (!args.live) {
    console.log(
      JSON.stringify(
        {
          mode: "plan_only",
          provider: "openai-web-search",
          location: "New York City",
          options: args.options,
          limits: API_LIMITS,
          writes: false,
          paid_calls: false,
          next: "Read docs/INGESTION.md before enabling live mode.",
        },
        null,
        2,
      ),
    );
    return;
  }
  const config = readIngestionConfig(process.env);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const deadline = setTimeout(cancel, 300000);
  try {
    const summary = await runIngestion(args.options, {
      provider: createOpenAIProvider(config.apiKey, config.model),
      repository: createIngestionRepository(
        config.supabaseUrl,
        config.serviceRoleKey,
      ),
      signal: controller.signal,
      onProgress: saveProgress,
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.status === "succeeded" ? 0 : 1;
  } finally {
    clearTimeout(deadline);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error: unknown) => {
  console.error(
    "Ingestion stopped: " + errorCode(error) + ". See docs/INGESTION.md.",
  );
  process.exitCode = 1;
});
