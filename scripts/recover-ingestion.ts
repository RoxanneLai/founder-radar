import { runRecoveryCli } from "../lib/ingestion/recovery.ts";

async function main(): Promise<void> {
  try {
    console.log(
      JSON.stringify(await runRecoveryCli(process.argv.slice(2)), null, 2),
    );
  } catch (error) {
    console.error(
      error instanceof Error && error.name !== "ZodError"
        ? error.message
        : "Ingestion recovery failed without printing private data.",
    );
    process.exitCode = 1;
  }
}

await main();
