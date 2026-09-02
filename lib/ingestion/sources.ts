import type { SourceIdentity } from "./contracts.ts";

export const ALLOWED_DOMAINS = [
  "luma.com",
  "lu.ma",
  "meetup.com",
  "eventbrite.com",
];

/** Normalize identity only; no HTTP requests are made to model-provided URLs. */
export function sourceIdentity(value: string): SourceIdentity | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (!ALLOWED_DOMAINS.includes(host)) return null;
    url.hostname = host === "lu.ma" ? "luma.com" : host;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key))
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    let externalId: string | null = null;
    if (host === "meetup.com") {
      externalId = url.pathname.match(/^\/[^/]+\/events\/(\d+)$/)?.[1] ?? null;
      if (!externalId) return null;
    } else if (host === "eventbrite.com") {
      externalId = url.pathname.match(/^\/e\/[^/]*tickets-(\d+)$/)?.[1] ?? null;
      if (!externalId) return null;
    } else if (
      !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
      /^\/(discover|explore|home|signin|login|pricing|calendar|create|nyc|new-york)$/i.test(
        url.pathname,
      )
    ) {
      return null;
    }
    return {
      source_name: url.hostname,
      source_url: url.toString(),
      external_id: externalId,
    };
  } catch {
    return null;
  }
}

export function selectSources(urls: string[], limit: number): SourceIdentity[] {
  const selected = new Map<string, SourceIdentity>();
  const externalIds = new Set<string>();
  for (const url of urls) {
    const source = sourceIdentity(url);
    if (!source) continue;
    const id = source.external_id
      ? source.source_name + ":" + source.external_id
      : null;
    if (selected.has(source.source_url) || (id && externalIds.has(id)))
      continue;
    selected.set(source.source_url, source);
    if (id) externalIds.add(id);
    if (selected.size >= limit) break;
  }
  return [...selected.values()];
}
