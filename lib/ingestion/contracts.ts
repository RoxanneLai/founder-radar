import { z } from "zod";
import type { Database, Json } from "../database.types.ts";

// A quote anchors every field to the research report. It is not independent
// verification of the original page, so ingestion can only create drafts.
const textFact = z
  .object({
    value: z.string().nullable(),
    quote: z.string().nullable(),
  })
  .strict();
const priceFact = z
  .object({
    value: z.number().int().min(0).max(2147483647).nullable(),
    quote: z.string().nullable(),
  })
  .strict();
const relevantFact = z
  .object({
    value: z.boolean().nullable(),
    quote: z.string().nullable(),
  })
  .strict();

export const candidateSchema = z
  .object({
    source_url: z.string(),
    relevant_to_founders: relevantFact,
    title: textFact,
    organizer_name: textFact,
    starts_at: textFact,
    ends_at: textFact,
    time_zone: textFact,
    venue_name: textFact,
    address_line: textFact,
    city: textFact,
    region: textFact,
    country_code: textFact,
    event_format: textFact,
    price_amount_cents: priceFact,
    currency_code: textFact,
    registration_status: textFact,
  })
  .strict();

export const extractionSchema = z
  .object({
    candidates: z.array(candidateSchema).max(10),
  })
  .strict();

export type Candidate = z.infer<typeof candidateSchema>;
export type EventDraft = Pick<
  Database["public"]["Tables"]["events"]["Insert"],
  | "title"
  | "organizer_name"
  | "starts_at"
  | "ends_at"
  | "time_zone"
  | "venue_name"
  | "address_line"
  | "city"
  | "region"
  | "country_code"
  | "event_format"
  | "price_amount_cents"
  | "currency_code"
  | "registration_status"
>;

export type SearchOptions = {
  from: string;
  to: string;
  limit: number;
};

export type SourceIdentity = {
  source_name: string;
  source_url: string;
  external_id: string | null;
};

export type Research = {
  report: string;
  urls: string[];
  metadata: Json;
};

export type Extraction = {
  candidates: unknown[];
  metadata: Json;
};

export type ProviderDiagnostic = {
  phase: "research" | "extraction";
  requested_model: string | null;
  response_id: string | null;
  model: string | null;
  http_status: number | null;
  finish_reason: string | null;
  search_usage: "missing" | "invalid" | "reported";
  search_tool_calls: number | null;
  search_verification?: "usage_counter" | "bounded_citations";
  citation_count: number | null;
  tool_call_count: number | null;
  content_characters: number | null;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    cost: number | null;
  };
};

export interface DiscoveryProvider {
  getDiagnostics?(): ProviderDiagnostic[];
  research(options: SearchOptions, signal: AbortSignal): Promise<Research>;
  extract(
    research: Research,
    sources: SourceIdentity[],
    signal: AbortSignal,
  ): Promise<Extraction>;
}

export type Observation = SourceIdentity & {
  content_text?: string;
  content_hash?: string;
  raw_payload?: Json;
  error_code?: string;
};

export type SaveResult = {
  source_id: string;
  event_id: string | null;
  source_created: boolean;
  event_written: boolean;
};

export type RunSummary = {
  run_id: string;
  status: "running" | "succeeded" | "partial" | "failed" | "cancelled";
  sources_discovered: number;
  sources_created: number;
  sources_updated: number;
  events_written: number;
  sources_unlinked: number;
  errors: string[];
  provider_diagnostics?: ProviderDiagnostic[];
};

export interface IngestionRepository {
  start(options: SearchOptions): Promise<string>;
  checkpoint(runId: string, metadata: Json): Promise<void>;
  save(
    runId: string,
    source: Observation,
    event: EventDraft | null,
    observedAt: string,
  ): Promise<SaveResult>;
  finish(summary: RunSummary, metadata: Json): Promise<void>;
}
