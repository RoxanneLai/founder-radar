import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types.ts";
import type {
  EventDraft,
  IngestionRepository,
  Observation,
  RunSummary,
  SaveResult,
  SearchOptions,
} from "./contracts.ts";
import { IngestionError } from "./errors.ts";

export function createIngestionRepository(
  url: string,
  key: string,
): IngestionRepository {
  const client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          redirect: "error",
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        }),
    },
  });
  return new SupabaseIngestionRepository(client);
}

export class SupabaseIngestionRepository implements IngestionRepository {
  private readonly client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  async start(options: SearchOptions): Promise<string> {
    // Check the migrated schema before allowing the orchestrator to spend on research.
    const { error: schemaError } = await this.client
      .from("event_sources")
      .select("id,last_attempt_at,last_attempt_error")
      .limit(0);
    if (schemaError) throw new IngestionError("ingestion_preflight_failed");
    const { data, error } = await this.client
      .from("search_runs")
      .insert({
        agent_name: "founder-radar-discovery",
        agent_version: "0.1.0",
        provider: "openai-web-search",
        search_parameters: { ...options },
        status: "running",
      })
      .select("id")
      .single();
    if (error || !data) throw new IngestionError("run_start_failed");
    return data.id;
  }

  async checkpoint(runId: string, metadata: Json): Promise<void> {
    const { data, error } = await this.client
      .from("search_runs")
      .update({ metadata })
      .eq("id", runId)
      .eq("status", "running")
      .select("id")
      .single();
    if (error || !data) throw new IngestionError("run_checkpoint_failed");
  }

  async save(
    runId: string,
    source: Observation,
    event: EventDraft | null,
    observedAt: string,
  ): Promise<SaveResult> {
    const { data, error } = await this.client
      .rpc("ingest_event_source", {
        p_run_id: runId,
        p_source: { ...source },
        p_event: event ? { ...event } : null,
        p_observed_at: observedAt,
      })
      .single();
    if (error || !data)
      throw new IngestionError(
        error?.code === "PGRST202"
          ? "ingestion_migration_required"
          : "source_save_failed",
      );
    return { ...data, event_id: data.event_id ?? null };
  }

  async finish(summary: RunSummary, metadata: Json): Promise<void> {
    const { data, error } = await this.client
      .from("search_runs")
      .update({
        status: summary.status,
        completed_at: new Date().toISOString(),
        sources_discovered: summary.sources_discovered,
        sources_created: summary.sources_created,
        sources_updated: summary.sources_updated,
        error_message: summary.errors.join(", ") || null,
        metadata,
      })
      .eq("id", summary.run_id)
      .eq("status", "running")
      .select("id")
      .single();
    if (error || !data) throw new IngestionError("run_finish_failed");
  }
}
