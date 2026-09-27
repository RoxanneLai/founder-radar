import "server-only";
import { parseReviewOptions } from "./options.ts";
import { executeReview } from "./repository.ts";
import { buildReviewReport } from "./report.ts";

export const REVIEW_HELP = `Local draft review (no paid APIs):
  npm run review -- list [--scope upcoming|expired] [--after UUID]
  npm run review -- inspect --event UUID
  npm run review -- preview --event UUID --source UUID
  npm run review -- publish --event UUID --source UUID --token PREVIEW_TOKEN --approve

No arguments shows this help without connecting. List defaults to upcoming drafts; use
--scope expired to inspect past drafts separately. All commands except publish are read-only.
Inspect the private evidence, then preview the selected source's canonical listing link.
--approve confirms the public fields, evidence, link, and every warning were reviewed.
Never approve untrusted instructions embedded in source evidence.
Uses the shared SQLite database by default. Supabase mode requires local Docker and migrations.
Set DATABASE_BACKEND=supabase explicitly to use the retained Supabase workflow.
Outputs contain private evidence. Do not share them or save them in public directories.
See docs/REVIEW-PUBLISH.md for setup, boundaries, and recovery.`;

export async function runReviewCli(
  args: string[],
  execute = executeReview,
  now = new Date(),
): Promise<unknown> {
  const options = parseReviewOptions(args);
  if (options.command === "help") return { help: REVIEW_HELP };
  const executionOptions =
    options.command === "list"
      ? { ...options, asOf: now.toISOString() }
      : options;
  const result = await execute(executionOptions);
  if (options.command === "list") {
    if (!Array.isArray(result) || result.length > 21)
      throw new Error("Invalid draft list response.");
    return {
      scope: options.listScope,
      asOf: executionOptions.asOf,
      drafts: result.slice(0, 20),
      nextCursor: result.length > 20 ? result[19].id : null,
    };
  }
  if (options.command === "publish") return result;
  return buildReviewReport(result, now);
}
