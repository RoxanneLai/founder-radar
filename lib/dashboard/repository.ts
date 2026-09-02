import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types.ts";
import { readDashboardConfig } from "./config.ts";
import {
  DASHBOARD_LIMIT,
  dashboardWindow,
  normalizePublishedEvents,
} from "./normalize.ts";
import type { DashboardResult } from "./types.ts";

// Intentionally no joins, source evidence, internal timestamps, or run metadata.
export const PUBLIC_EVENT_COLUMNS =
  "id,title,organizer_name,starts_at,ends_at,time_zone,venue_name,neighborhood,borough,city,region,country_code,event_format,categories,price_amount_cents,currency_code,registration_status,publication_status,is_fixture,founder_score,investor_score,networking_score,recommendation,potential_downside";

/** Read fresh public data only. Failures are safe states, never demo fallbacks. */
export async function loadDashboard(
  options: {
    env?: NodeJS.ProcessEnv;
    now?: Date;
    fetch?: typeof globalThis.fetch;
  } = {},
): Promise<DashboardResult> {
  try {
    const config = readDashboardConfig(options.env ?? process.env);
    if (!config) return { status: "unconfigured", events: [], hasMore: false };
    const now = options.now ?? new Date();
    const window = dashboardWindow(now);
    const fetcher = options.fetch ?? globalThis.fetch;
    const client = createClient<Database>(
      config.url,
      config.anonKey ?? "local-anonymous",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            if (!config.anonKey) {
              // The SDK requires a key at construction. Never send the placeholder;
              // keyless local PostgREST must use its anonymous database role.
              headers.delete("authorization");
              headers.delete("apikey");
            }
            return fetcher(input, {
              ...init,
              headers,
              cache: "no-store",
              redirect: "error",
            });
          },
        },
      },
    );
    const { data, error } = await client
      .from("events")
      .select(PUBLIC_EVENT_COLUMNS)
      .eq("publication_status", "published")
      .eq("is_fixture", false)
      .eq("city", "New York")
      .eq("region", "NY")
      .eq("country_code", "US")
      .eq("time_zone", "America/New_York")
      .in("event_format", ["in-person", "hybrid"])
      .neq("registration_status", "cancelled")
      .gte("starts_at", window.start)
      .lt("starts_at", window.end)
      .order("networking_score", { ascending: false, nullsFirst: false })
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(DASHBOARD_LIMIT + 1)
      .retry(false)
      .abortSignal(AbortSignal.timeout(8000));
    if (error || data === null)
      return { status: "unavailable", events: [], hasMore: false };
    const events = normalizePublishedEvents(data, now);
    if (events.length === 0)
      return { status: "empty", events: [], hasMore: false };
    return {
      status: "ready",
      events: events.slice(0, DASHBOARD_LIMIT),
      hasMore: events.length > DASHBOARD_LIMIT,
    };
  } catch {
    // Do not expose provider responses, URLs, credentials, or raw exceptions.
    return { status: "unavailable", events: [], hasMore: false };
  }
}
