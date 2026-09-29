import { sourceIdentity } from "../ingestion/sources.ts";
import { IngestionError } from "../ingestion/errors.ts";

/** Multi-event reports must ground each candidate in its own numbered section. */
export function careerSourceEvidence(
  report: string,
  sourceUrl: string,
  sourceCount: number,
): string {
  if (sourceCount === 1) return report;
  const sections = report.split(/^###\s+/m).slice(1);
  const matching = sections.filter((section) => {
    const urls = section.match(/https:\/\/[^\s<>"\])]+/g) ?? [];
    return urls.some((url) => sourceIdentity(url)?.source_url === sourceUrl);
  });
  if (matching.length !== 1)
    throw new IngestionError("source_evidence_ambiguous");
  const identities = new Set(
    (matching[0].match(/https:\/\/[^\s<>"\])]+/g) ?? [])
      .map((url) => sourceIdentity(url)?.source_url)
      .filter(Boolean),
  );
  if (identities.size !== 1)
    throw new IngestionError("source_evidence_ambiguous");
  return matching[0];
}
