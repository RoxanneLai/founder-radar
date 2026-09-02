import { mkdir, writeFile } from "node:fs/promises";
import { parseIngestionArgs, INGEST_HELP } from "../lib/ingestion/cli.ts";
import { readIngestionConfig } from "../lib/ingestion/config.ts";
import {
  readModelConfig,
  readOpenRouterKey,
} from "../lib/ingestion/local-config.ts";
import { errorCode } from "../lib/ingestion/errors.ts";
import {
  API_LIMITS,
  createOpenRouterProvider,
} from "../lib/ingestion/openrouter-provider.ts";
import { createIngestionRepository } from "../lib/ingestion/repository.ts";
import { runIngestion } from "../lib/ingestion/run.ts";
import type { RunSummary, SearchOptions } from "../lib/ingestion/contracts.ts";

async function saveProgress(summary: RunSummary): Promise<void> {
  await mkdir("codex-tmp", { recursive: true });
  await writeFile(
    "codex-tmp/ingestion-" + summary.run_id + ".json",
    JSON.stringify(summary, null, 2) + "\n",
  );
}

function printPlan(options: SearchOptions, model: string): void {
  console.log(
    JSON.stringify(
      {
        mode: "plan_only",
        provider: "openrouter-web-search",
        model,
        location: "New York City",
        options,
        limits: API_LIMITS,
        writes: false,
        paid_calls: false,
        next: "Read docs/INGESTION.md before enabling live mode.",
      },
      null,
      2,
    ),
  );
}

async function executeLive(
  options: SearchOptions,
  model: string,
): Promise<void> {
  const config = readIngestionConfig(process.env);
  const apiKey = await readOpenRouterKey();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const deadline = setTimeout(cancel, 300000);
  try {
    const summary = await runIngestion(options, {
      provider: createOpenRouterProvider(apiKey, model),
      repository: createIngestionRepository(
        config.supabaseUrl,
        config.serviceRoleKey,
        model,
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

async function main(): Promise<void> {
  const args = parseIngestionArgs(process.argv.slice(2));
  if (args.help) {
    console.log(INGEST_HELP);
    return;
  }
  const settings = await readModelConfig(args.configPath, args.model);
  if (!args.live) printPlan(args.options, settings.model);
  else await executeLive(args.options, settings.model);
}

main().catch((error: unknown) => {
  console.error(
    "Ingestion stopped: " + errorCode(error) + ". See docs/INGESTION.md.",
  );
  process.exitCode = 1;
});
