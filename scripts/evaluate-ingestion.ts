import { runEvaluationCli } from "../lib/ingestion/evaluation.ts";

async function main(): Promise<void> {
  try {
    console.log(
      JSON.stringify(await runEvaluationCli(process.argv.slice(2)), null, 2),
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Ingestion evaluation failed without exposing private data.",
    );
    process.exitCode = 1;
  }
}

await main();
