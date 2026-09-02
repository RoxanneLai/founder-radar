import { runReviewCli } from "../lib/review/cli.ts";

async function main(): Promise<void> {
  try {
    // JSON escapes untrusted control characters rather than interpreting terminal sequences.
    console.log(
      JSON.stringify(await runReviewCli(process.argv.slice(2)), null, 2),
    );
  } catch (error) {
    console.error(
      error instanceof Error && error.name !== "ZodError"
        ? error.message
        : "Invalid review data. No private diagnostic output was printed.",
    );
    process.exitCode = 1;
  }
}

await main();
