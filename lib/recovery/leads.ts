import "server-only";
import { createHash } from "node:crypto";
import { lstat, open, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readDatabaseSelection } from "../storage/config.ts";
import {
  openSqliteDatabase,
  withImmediateTransaction,
  newId,
} from "../storage/sqlite.ts";
import { saveRecoveredDraft } from "../ingestion/sqlite-repository.ts";
import { normalizeCandidate } from "../ingestion/normalize.ts";
import { candidateBaseSchema } from "../ingestion/contracts.ts";
import { sourceIdentity } from "../ingestion/sources.ts";
import { IngestionError, errorCode } from "../ingestion/errors.ts";
import { readCareerTarget } from "../career/profile.ts";
import type { CareerTarget } from "../career/profile.ts";
import type { EventDraft } from "../ingestion/contracts.ts";
import type { Json } from "../database.types.ts";
import { CAREER_CAUTION_LABELS } from "../career/display.ts";
import { careerAssessmentSchema } from "../career/contracts.ts";

const uuid = z.string().uuid();
const evidenceSchema = z
  .object({
    profile: z.enum(["founder", "career"]),
    source_url: z.string().url().max(2048),
    observed_at: z.iso.datetime({ offset: true }),
    evidence_kind: z.enum([
      "reviewer_transcription",
      "reviewer_factual_digest",
    ]),
    source_text: z.string().trim().min(1).max(40000),
    reviewed_run_ids: z.array(uuid).max(20),
    resolution_note: z.string().trim().min(1).max(4000),
    conflicts: z
      .array(
        z
          .object({
            old_quote: z.string().min(1).max(4000),
            new_quote: z.string().min(1).max(4000),
            decision: z.enum(["use_fresh", "unresolved"]),
            explanation: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .max(15),
    candidate: z.unknown(),
  })
  .strict();
type Evidence = z.infer<typeof evidenceSchema>;
type Snapshot = {
  source: Record<string, unknown>;
  reports: Array<{ id: string; report: string }>;
};
type RecoveryPreview = {
  draft: EventDraft;
  evidence: Evidence;
  snapshot: Snapshot;
  token: string;
  warnings: string[];
};

export const LEAD_HELP = `Private SQLite leads → unpublished drafts → separate publication review:
  npm run recover -- list
  npm run recover -- inspect --source UUID
  npm run recover -- template --source UUID --file codex-tmp/lead.json
  npm run recover -- preview --source UUID --file codex-tmp/lead.json
  npm run recover -- apply --source UUID --file codex-tmp/lead.json --token HEX --approve
Help uses no credentials or database. List/inspect never publish. Template defaults
to founder; set profile career and supply the career candidate schema for career leads.
Source text is a reviewer transcription/digest, not an authenticated page archive.`;

export function parseLeadArgs(args: string[]) {
  const [command = "help", ...rest] = args;
  const allowed: Record<string, string[]> = {
    help: [],
    list: [],
    inspect: ["--source"],
    template: ["--source", "--file"],
    preview: ["--source", "--file"],
    apply: ["--source", "--file", "--token", "--approve"],
  };
  if (!Object.hasOwn(allowed, command))
    throw new IngestionError("invalid_recovery_arguments");
  const options: Record<string, string> = {};
  for (let index = 0; index < rest.length; index++) {
    const key = rest[index];
    if (!allowed[command].includes(key) || Object.hasOwn(options, key))
      throw new IngestionError("invalid_recovery_arguments");
    const value = key === "--approve" ? "true" : rest[++index];
    if (!value || value.startsWith("--"))
      throw new IngestionError("invalid_recovery_arguments");
    options[key] = value;
  }
  if (
    !["help", "list"].includes(command) &&
    !uuid.safeParse(options["--source"]).success
  )
    throw new IngestionError("invalid_recovery_arguments");
  if (["template", "preview", "apply"].includes(command) && !options["--file"])
    throw new IngestionError("invalid_recovery_arguments");
  if (
    command === "apply" &&
    (options["--approve"] !== "true" ||
      !/^[a-f0-9]{64}$/.test(options["--token"] ?? ""))
  )
    throw new IngestionError("recovery_approval_required");
  return {
    command,
    sourceId: options["--source"],
    file: options["--file"],
    token: options["--token"],
  };
}

/** Read every retained associated report or refuse, never silently truncate history. */
function snapshot(database: DatabaseSync, sourceId: string): Snapshot {
  const source = database
    .prepare("select * from event_sources where id = ?")
    .get(sourceId);
  if (!source || source.event_id !== null)
    throw new IngestionError("recovery_source_linked_or_missing");
  const retained = database
    .prepare("select id, metadata from search_runs order by id limit 10001")
    .all();
  if (retained.length > 10000)
    throw new IngestionError("recovery_history_scan_limit");
  const identity = sourceIdentity(String(source.source_url));
  const runs = retained.filter((run) => {
    if (run.id === source.discovered_by_run_id) return true;
    const metadata = JSON.parse(String(run.metadata));
    return (
      Array.isArray(metadata.consulted_urls) &&
      metadata.consulted_urls.some((url: unknown) => {
        if (typeof url !== "string") return false;
        const consulted = sourceIdentity(url);
        return (
          consulted &&
          (consulted.source_url === source.source_url ||
            (identity?.external_id &&
              identity.source_name === consulted.source_name &&
              identity.external_id === consulted.external_id))
        );
      })
    );
  });
  if (runs.length > 20) throw new IngestionError("recovery_history_limit");
  const reports = runs.map((run) => {
    const metadata = JSON.parse(String(run.metadata));
    return {
      id: String(run.id),
      report:
        typeof metadata.research_report === "string"
          ? metadata.research_report
          : "",
    };
  });
  return { source, reports };
}

/** Bound files and reject links/permissive modes before parsing private evidence. */
export async function readRecoveryEvidence(path: string): Promise<Evidence> {
  try {
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > 131072 ||
      (info.mode & 0o077) !== 0
    )
      throw new Error();
    const file = await open(path, "r");
    try {
      const actual = await file.stat();
      if (
        actual.ino !== info.ino ||
        actual.dev !== info.dev ||
        actual.size > 131072
      )
        throw new Error();
      return evidenceSchema.parse(JSON.parse(await file.readFile("utf8")));
    } finally {
      await file.close();
    }
  } catch {
    throw new IngestionError("invalid_recovery_evidence");
  }
}

function checkRecoveryFreshness(
  evidence: Evidence,
  state: Snapshot,
  now: Date,
): void {
  const observed = Date.parse(evidence.observed_at);
  if (
    observed > now.getTime() ||
    now.getTime() - observed > 86400000 ||
    observed <
      Date.parse(
        String(state.source.last_attempt_at ?? state.source.first_seen_at),
      )
  )
    throw new IngestionError("stale_recovery_evidence");
  const ids = [...new Set(evidence.reviewed_run_ids)].sort();
  if (
    ids.length !== evidence.reviewed_run_ids.length ||
    JSON.stringify(ids) !==
      JSON.stringify(state.reports.map((run) => run.id).sort())
  )
    throw new IngestionError("recovery_history_unacknowledged");
  const oldText =
    state.reports.map((run) => run.report).join("\n") +
    "\n" +
    String(state.source.content_text ?? "");
  for (const conflict of evidence.conflicts) {
    if (conflict.decision !== "use_fresh")
      throw new IngestionError("recovery_conflict_unresolved");
    if (
      !oldText.includes(conflict.old_quote) ||
      !evidence.source_text.includes(conflict.new_quote)
    )
      throw new IngestionError("recovery_conflict_ungrounded");
  }
}

function checkNames(candidate: unknown): void {
  if (!candidate || typeof candidate !== "object")
    throw new IngestionError("invalid_candidate");
  for (const key of ["organizer_name", "venue_name", "address_line"]) {
    const fact = (candidate as Record<string, unknown>)[key];
    if (
      fact &&
      typeof fact === "object" &&
      "value" in fact &&
      fact.value !== null &&
      "quote" in fact &&
      (typeof fact.value !== "string" ||
        typeof fact.quote !== "string" ||
        !fact.quote.toLowerCase().includes(fact.value.toLowerCase()))
    )
      throw new IngestionError("unsupported_recovery_fact");
  }
}

function recoveryWarnings(draft: EventDraft): string[] {
  const warnings: string[] = [];
  if (
    Array.isArray(draft.normalization_notes) &&
    draft.normalization_notes.includes("timezone_inferred_nyc")
  )
    warnings.push(
      "Timezone was not stated; America/New_York was inferred from confirmed NYC attendance. Check the local clock time before publication.",
    );
  for (const [value, label] of [
    [draft.organizer_name, "Organizer"],
    [draft.venue_name, "Venue"],
    [draft.ends_at, "End time"],
    [draft.price_amount_cents, "Admission price"],
  ] as const)
    if (value == null) warnings.push(`${label} stays unknown.`);
  if (draft.registration_status === "unknown")
    warnings.push("Registration availability stays unknown.");
  const assessment = careerAssessmentSchema.safeParse(draft.career_assessment);
  if (assessment.success)
    warnings.push(
      ...assessment.data.cautions.map(
        (caution) => CAREER_CAUTION_LABELS[caution],
      ),
    );
  return [...new Set(warnings)];
}

/** Preview and apply run identical validation; the token includes all old/new evidence. */
export function previewRecovery(
  database: DatabaseSync,
  sourceId: string,
  evidence: Evidence,
  now: Date,
  target?: CareerTarget,
): RecoveryPreview {
  const parsed = evidenceSchema.safeParse(evidence);
  if (!parsed.success) throw new IngestionError("invalid_recovery_evidence");
  evidence = parsed.data;
  const state = snapshot(database, sourceId);
  checkRecoveryFreshness(evidence, state, now);
  const source = sourceIdentity(evidence.source_url);
  if (
    !source ||
    source.source_url !== evidence.source_url ||
    source.source_url !== state.source.source_url
  )
    throw new IngestionError("source_mismatch");
  checkNames(evidence.candidate);
  const draft = normalizeCandidate(
    evidence.candidate,
    source,
    evidence.source_text,
    {
      from: now.toISOString(),
      to: new Date(now.getTime() + 31 * 86400000).toISOString(),
      limit: 1,
      profile: evidence.profile,
      ...(evidence.profile === "career" ? { career_target: target } : {}),
    },
    now.toISOString(),
  );
  const token = createHash("sha256")
    .update(JSON.stringify({ evidence, snapshot: state, draft }))
    .digest("hex");
  return {
    draft,
    evidence,
    snapshot: state,
    token,
    warnings: recoveryWarnings(draft),
  };
}

export function applyRecovery(
  database: DatabaseSync,
  sourceId: string,
  evidence: Evidence,
  token: string,
  now: Date,
  target?: CareerTarget,
) {
  return withImmediateTransaction(database, () => {
    const preview = previewRecovery(database, sourceId, evidence, now, target);
    if (token !== preview.token)
      throw new IngestionError("stale_recovery_preview");
    const identity = sourceIdentity(evidence.source_url)!;
    const eventId = saveRecoveredDraft(
      database,
      sourceId,
      preview.draft,
      {
        ...identity,
        content_text: evidence.source_text,
        content_hash: createHash("sha256")
          .update(evidence.source_text)
          .digest("hex"),
        raw_payload: {
          evidence_kind: evidence.evidence_kind,
          candidate: evidence.candidate as Json,
          reviewed_run_ids: evidence.reviewed_run_ids,
          resolution_note: evidence.resolution_note,
          normalization_notes: preview.draft.normalization_notes ?? [],
        },
      },
      evidence.observed_at,
    );
    database
      .prepare(
        "insert into lead_recovery_audits (id, source_id, event_id, approved_at, preview_token, snapshot) values (?, ?, ?, ?, ?, ?)",
      )
      .run(
        newId(),
        sourceId,
        eventId,
        now.toISOString(),
        token,
        JSON.stringify(preview),
      );
    return {
      mode: "lead_recovered_to_private_draft",
      event_id: eventId,
      source_id: sourceId,
      publication_status: "draft",
      paid_requests: 0,
    };
  });
}

async function writeTemplate(path: string, state: Snapshot): Promise<void> {
  const destination = resolve(path);
  if (!destination.startsWith(resolve("codex-tmp") + "/"))
    throw new IngestionError("recovery_template_path_unsafe");
  const candidate: Record<string, unknown> = {};
  for (const key of Object.keys(candidateBaseSchema.shape))
    candidate[key] = { value: null, quote: null };
  candidate.source_url = state.source.source_url;
  candidate.source_verification = {
    status: "rejected",
    reason: "source_evidence_insufficient",
  };
  const template = {
    profile: "founder",
    source_url: state.source.source_url,
    observed_at: new Date().toISOString(),
    evidence_kind: "reviewer_transcription",
    source_text: "REPLACE with freshly checked source text",
    reviewed_run_ids: state.reports.map((run) => run.id),
    resolution_note:
      "REPLACE with your evidence review and conflict-resolution note",
    conflicts: [],
    candidate,
  };
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(template, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}

export async function runLeadCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const options = parseLeadArgs(args);
  if (options.command === "help") return { help: LEAD_HELP };
  const selection = readDatabaseSelection(env);
  if (selection.backend !== "sqlite")
    throw new IngestionError("lead_recovery_sqlite_only");
  const evidence = ["preview", "apply"].includes(options.command)
    ? await readRecoveryEvidence(options.file)
    : null;
  const target =
    evidence?.profile === "career" ? await readCareerTarget() : undefined;
  const database =
    options.command === "apply"
      ? openSqliteDatabase(selection.path)
      : new DatabaseSync(selection.path, { readOnly: true });
  try {
    if (options.command === "list")
      return {
        privacy: "PRIVATE LEAD QUEUE",
        leads: database
          .prepare(
            "select id, source_name, source_url, last_attempt_error, last_attempt_at from event_sources where event_id is null order by last_attempt_at desc limit 50",
          )
          .all(),
        limit: 50,
      };
    if (options.command === "inspect")
      return {
        privacy: "PRIVATE — saved research is not verified current evidence",
        ...snapshot(database, options.sourceId),
      };
    if (options.command === "template") {
      await writeTemplate(options.file, snapshot(database, options.sourceId));
      return {
        template: options.file,
        writes: "private template only",
        publication: false,
      };
    }
    if (options.command === "preview") {
      const preview = previewRecovery(
        database,
        options.sourceId,
        evidence!,
        new Date(),
        target,
      );
      return {
        privacy:
          "PRIVATE RECOVERY PREVIEW — reviewer supplied evidence requires human checking",
        ...preview,
        warnings: [
          ...preview.warnings,
          "Identify and declare all semantic conflicts; this CLI cannot authenticate supplied text or detect every contradiction.",
          "After apply, use the separate publication-review workflow.",
        ],
        database_writes: 0,
      };
    }
    return applyRecovery(
      database,
      options.sourceId,
      evidence!,
      options.token,
      new Date(),
      target,
    );
  } finally {
    database.close();
  }
}

export function recoveryError(error: unknown): string {
  return errorCode(error);
}
