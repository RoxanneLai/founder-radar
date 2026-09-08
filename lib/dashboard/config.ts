import "server-only";

export type DashboardConfig = { url: string; anonKey: string | null };

/** Reject elevated keys even if accidentally pasted into the public-key setting. */
function isAnonymousKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return false;
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString(),
    );
    return (
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      payload.role === "anon"
    );
  } catch {
    return false;
  }
}

/** This increment is local-only; no hosted requests or service-role fallback. */
export function readDashboardConfig(
  env: NodeJS.ProcessEnv,
): DashboardConfig | null {
  const rawUrl = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!rawUrl && !anonKey) return null;
  if (!rawUrl || (anonKey && !isAnonymousKey(anonKey)))
    throw new Error("Invalid dashboard configuration");
  const url = new URL(rawUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid dashboard configuration");
  }
  // With auth disabled in supabase/config.toml, local PostgREST uses its anon role.
  return { url: url.origin, anonKey: anonKey || null };
}
