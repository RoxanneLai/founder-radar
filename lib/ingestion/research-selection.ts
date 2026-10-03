import { z } from "zod";
import { IngestionError } from "./errors.ts";
import { sourceIdentity } from "./sources.ts";

const selectionSchema = z
  .object({
    version: z.literal("rightroom-discovery-v1"),
    listings: z
      .array(
        z
          .object({
            source_url: z.string().min(1).max(2000),
            disposition: z.enum(["selected", "needs_verification", "rejected"]),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

export const DISCOVERY_SELECTION_INSTRUCTIONS = [
  "End the report with exactly one fenced block whose language is rightroom-discovery-v1.",
  'The block must contain only JSON with this shape: {"version":"rightroom-discovery-v1","listings":[{"source_url":"https://...","disposition":"selected"}]}. No other keys.',
  "Include at most ten distinct supported individual listing URLs in that block. Cite each URL beside its evidence in the report.",
  "Use selected for supported eligible events, needs_verification for plausible future relevant listings whose missing facts require checking the original page, and rejected for explicitly past, cancelled, outside-window, virtual-only or ineligible listings discussed as background.",
  "The selected and needs_verification entries together must not exceed max_candidates. Never select a rejected/background citation simply to fill that cap.",
  "Missing venue or availability details may warrant needs_verification, but never roll dates forward or promote a known past listing. Source capture and local validation still determine eligibility.",
  "If no usable leads exist, return an empty listings array or only rejected entries. Citations in explanations are not a candidate shortlist.",
].join(" ");

type ResearchSelection = {
  urls: string[];
  format: "manifest_v1" | "legacy_numbered_sections";
  rejectedCount: number | null;
  verificationCount: number | null;
};

/** Require exactly one complete, strict block; malformed manifests never fall back. */
function parseSelectionBlock(report: string): z.infer<typeof selectionSchema> {
  const blocks = [
    ...report.matchAll(
      /^```rightroom-discovery-v1[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gm,
    ),
  ];
  if (
    blocks.length !== 1 ||
    report.split("```rightroom-discovery-v1").length !== 2
  )
    throw new IngestionError("invalid_research_selection");
  let input: unknown;
  try {
    input = JSON.parse(blocks[0][1]);
  } catch {
    throw new IngestionError("invalid_research_selection");
  }
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) throw new IngestionError("invalid_research_selection");
  return parsed.data;
}

/** Apply dispositions before any citation intersection or candidate cap. */
function manifestSelection(
  report: string,
  maxCandidates: number,
): ResearchSelection {
  const parsed = parseSelectionBlock(report);
  const identities = new Set<string>();
  const urls: string[] = [];
  let rejectedCount = 0;
  let verificationCount = 0;
  for (const listing of parsed.listings) {
    const source = sourceIdentity(listing.source_url);
    if (!source) throw new IngestionError("invalid_research_selection");
    const identity = source.external_id
      ? `${source.source_name}:${source.external_id}`
      : source.source_url;
    if (identities.has(identity))
      throw new IngestionError("invalid_research_selection");
    identities.add(identity);
    if (listing.disposition === "rejected") rejectedCount += 1;
    else {
      urls.push(source.source_url);
      if (listing.disposition === "needs_verification") verificationCount += 1;
    }
  }
  if (urls.length > maxCandidates)
    throw new IngestionError("invalid_research_selection");
  return { urls, format: "manifest_v1", rejectedCount, verificationCount };
}

/** Retain explicitly separated historical event sections, not narrative citations. */
function legacySelection(report: string): ResearchSelection {
  // Historical explicit sections remain readable, but stop at any subsequent
  // heading so a background/rejection section cannot supply a primary URL.
  const headings = [...report.matchAll(/^#{1,6}[ \t]+([^\n]*)$/gm)];
  const sections = headings.flatMap((heading, index) =>
    /^###\s+\d+[.)]\s+/.test(heading[0])
      ? [
          report.slice(
            heading.index!,
            headings[index + 1]?.index ?? report.length,
          ),
        ]
      : [],
  );
  if (!sections.length) throw new IngestionError("invalid_research_selection");
  const urls = sections.flatMap((section) => {
    for (const match of section.matchAll(/https:\/\/[^\s)\]}>'"]+/g)) {
      const source = sourceIdentity(match[0].replace(/[.,;:!?]+$/, ""));
      if (source) return [source.source_url];
    }
    return [];
  });
  return {
    urls: [...new Set(urls)],
    format: "legacy_numbered_sections",
    rejectedCount: null,
    verificationCount: null,
  };
}

/** Read only explicit selections; never promote all citations in a narrative report. */
export function researchSelection(
  report: string,
  maxCandidates = 10,
): ResearchSelection {
  return report.includes("rightroom-discovery-v1")
    ? manifestSelection(report, maxCandidates)
    : legacySelection(report);
}
