import { runInspectionCli } from "../lib/ingestion/inspection.ts";

async function main(): Promise<void> {
  try {
    console.log(
      JSON.stringify(await runInspectionCli(process.argv.slice(2)), null, 2),
    );
  } catch (error) {
    console.error(
      error instanceof Error && error.name !== "ZodError"
        ? error.message
        : "Ingestion inspection failed without printing private data.",
    );
    process.exitCode = 1;
  }
}

await main();
