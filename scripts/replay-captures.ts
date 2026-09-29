import { runCaptureReplayCli } from "../lib/ingestion/capture-replay.ts";

async function main(): Promise<void> {
  try {
    console.log(
      JSON.stringify(await runCaptureReplayCli(process.argv.slice(2)), null, 2),
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Capture replay failed without exposing private data.",
    );
    process.exitCode = 1;
  }
}

await main();
