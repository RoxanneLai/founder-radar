import "server-only";
import { createHash } from "node:crypto";
import type { Json } from "../database.types.ts";
import type {
  DiscoveryProvider,
  EventDraft,
  IngestionRepository,
  Research,
  RunSummary,
  SaveResult,
  SearchOptions,
  SourceIdentity,
} from "./contracts.ts";
import { IngestionError, errorCode } from "./errors.ts";
import { normalizeCandidate } from "./normalize.ts";
import { validateSearchOptions } from "./options.ts";
import { selectSources, sourceIdentity } from "./sources.ts";

type Dependencies = {
  provider: DiscoveryProvider;
  repository: IngestionRepository;
  signal: AbortSignal;
  now?: () => Date;
  onProgress?: (summary: RunSummary) => Promise<void>;
};
type PersistedSource = { source: SourceIdentity; eventId: string | null };
type RunContext = {
  summary: RunSummary;
  metadata: Record<string, Json>;
  options: SearchOptions;
  observedAt: string;
};

function checkCancellation(signal: AbortSignal): void {
  if (signal.aborted) throw new IngestionError("run_cancelled");
}

function addError(summary: RunSummary, code: string): void {
  if (!summary.errors.includes(code)) summary.errors.push(code);
}

function failureStatus(
  summary: RunSummary,
  signal: AbortSignal,
): RunSummary["status"] {
  if (signal.aborted) return "cancelled";
  return summary.sources_created + summary.sources_updated > 0
    ? "partial"
    : "failed";
}

async function reportProgress(
  summary: RunSummary,
  deps: Dependencies,
): Promise<void> {
  try {
    await deps.onProgress?.(structuredClone(summary));
  } catch {
    addError(summary, "progress_write_failed");
  }
}

function indexCandidates(
  candidates: unknown[],
  sources: SourceIdentity[],
  summary: RunSummary,
): Map<string, unknown[]> {
  const allowed = new Set(sources.map((source) => source.source_url));
  const result = new Map<string, unknown[]>();
  for (const item of candidates) {
    const url =
      item &&
      typeof item === "object" &&
      "source_url" in item &&
      typeof item.source_url === "string"
        ? sourceIdentity(item.source_url)?.source_url
        : null;
    if (!url || !allowed.has(url)) {
      addError(summary, "untrusted_candidate_url");
      continue;
    }
    result.set(url, [...(result.get(url) ?? []), item]);
  }
  return result;
}

async function saveExtractedSource(
  source: SourceIdentity,
  candidates: unknown[],
  research: Research,
  context: RunContext,
  repository: IngestionRepository,
): Promise<SaveResult> {
  let event: EventDraft;
  try {
    if (candidates.length !== 1)
      throw new IngestionError(
        candidates.length ? "duplicate_candidate" : "candidate_missing",
      );
    event = normalizeCandidate(
      candidates[0],
      source,
      research.report,
      context.options,
    );
  } catch (error) {
    const code = errorCode(error);
    addError(context.summary, code);
    return repository.save(
      context.summary.run_id,
      { ...source, error_code: code },
      null,
      context.observedAt,
    );
  }
  return repository.save(
    context.summary.run_id,
    {
      ...source,
      content_text: research.report,
      content_hash: createHash("sha256").update(research.report).digest("hex"),
      raw_payload: {
        evidence_kind: "model_web_search_report",
        research: research.metadata,
        candidate: JSON.parse(JSON.stringify(candidates[0])) as Json,
      },
    },
    event,
    context.observedAt,
  );
}

async function persistDiscovery(
  sources: SourceIdentity[],
  context: RunContext,
  deps: Dependencies,
): Promise<PersistedSource[]> {
  const persisted: PersistedSource[] = [];
  for (const source of sources) {
    checkCancellation(deps.signal);
    try {
      const saved = await deps.repository.save(
        context.summary.run_id,
        source,
        null,
        context.observedAt,
      );
      if (saved.source_created) context.summary.sources_created += 1;
      else context.summary.sources_updated += 1;
      if (!saved.event_id) context.summary.sources_unlinked += 1;
      persisted.push({ source, eventId: saved.event_id });
    } catch (error) {
      addError(context.summary, errorCode(error));
    }
  }
  return persisted;
}

async function extractCandidates(
  sources: SourceIdentity[],
  research: Research,
  context: RunContext,
  deps: Dependencies,
): Promise<unknown[]> {
  try {
    const extracted = await deps.provider.extract(
      research,
      sources,
      deps.signal,
    );
    context.metadata.extraction = extracted.metadata;
    return extracted.candidates;
  } catch (error) {
    const code = errorCode(error);
    // Preserve previous good snapshots; record only safe failure codes.
    for (const source of sources) {
      try {
        await deps.repository.save(
          context.summary.run_id,
          { ...source, error_code: code },
          null,
          context.observedAt,
        );
      } catch (saveError) {
        addError(context.summary, errorCode(saveError));
      }
    }
    throw error;
  }
}

async function processCandidates(
  persisted: PersistedSource[],
  research: Research,
  context: RunContext,
  deps: Dependencies,
): Promise<void> {
  checkCancellation(deps.signal);
  const sources = persisted.map((item) => item.source);
  const candidates = await extractCandidates(sources, research, context, deps);
  const indexed = indexCandidates(candidates, sources, context.summary);
  for (const { source, eventId } of persisted) {
    checkCancellation(deps.signal);
    try {
      const saved = await saveExtractedSource(
        source,
        indexed.get(source.source_url) ?? [],
        research,
        context,
        deps.repository,
      );
      if (saved.event_written) context.summary.events_written += 1;
      if (!eventId && saved.event_id) context.summary.sources_unlinked -= 1;
    } catch (error) {
      addError(context.summary, errorCode(error));
    }
    context.metadata.summary = { ...context.summary };
    await deps.repository.checkpoint(context.summary.run_id, context.metadata);
    await reportProgress(context.summary, deps);
  }
}

async function collectAndPersist(
  context: RunContext,
  deps: Dependencies,
): Promise<void> {
  const research = await deps.provider.research(context.options, deps.signal);
  checkCancellation(deps.signal);
  context.observedAt = (deps.now ?? (() => new Date()))().toISOString();
  const sources = selectSources(research.urls, context.options.limit);
  context.summary.sources_discovered = sources.length;
  Object.assign(context.metadata, {
    research: research.metadata,
    research_report: research.report,
    consulted_urls: research.urls,
  });
  await deps.repository.checkpoint(context.summary.run_id, context.metadata);
  const persisted = await persistDiscovery(sources, context, deps);
  context.metadata.summary = { ...context.summary };
  await deps.repository.checkpoint(context.summary.run_id, context.metadata);
  await reportProgress(context.summary, deps);
  if (persisted.length)
    await processCandidates(persisted, research, context, deps);
}

/** One bounded run: checkpoint research first, then save independent sources. */
export async function runIngestion(
  input: SearchOptions,
  deps: Dependencies,
): Promise<RunSummary> {
  const options = validateSearchOptions(input);
  checkCancellation(deps.signal);
  const summary: RunSummary = {
    run_id: await deps.repository.start(options),
    status: "running",
    sources_discovered: 0,
    sources_created: 0,
    sources_updated: 0,
    events_written: 0,
    sources_unlinked: 0,
    errors: [],
  };
  const context: RunContext = {
    summary,
    options,
    metadata: { evidence_kind: "model_web_search_report" },
    observedAt: "",
  };
  try {
    await reportProgress(summary, deps);
    await collectAndPersist(context, deps);
    checkCancellation(deps.signal);
    summary.status = summary.errors.length
      ? failureStatus(summary, deps.signal)
      : "succeeded";
  } catch (error) {
    addError(summary, errorCode(error));
    summary.status = failureStatus(summary, deps.signal);
  }
  await reportProgress(summary, deps);
  if (summary.status === "succeeded" && summary.errors.length) {
    summary.status = failureStatus(summary, deps.signal);
  }
  context.metadata.summary = { ...summary };
  try {
    await deps.repository.finish(summary, context.metadata);
  } catch (error) {
    addError(summary, errorCode(error));
    summary.status = failureStatus(summary, deps.signal);
    await reportProgress(summary, deps);
    throw error;
  }
  return summary;
}
