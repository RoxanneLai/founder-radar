import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { sourceIdentity } from "./sources.ts";
import { publicListingUrl } from "../public-listing-url.ts";
import { IngestionError } from "./errors.ts";
import type { SourceIdentity } from "./contracts.ts";

export const SOURCE_CAPTURE_LIMITS = {
  responseBytes: 1048576,
  textCharacters: 16000,
  totalTextCharacters: 80000,
  redirects: 2,
  timeoutMs: 20000,
  sources: 10,
} as const;

export const CAPTURE_ERROR_CODES = [
  "source_capture_blocked_url",
  "source_capture_blocked_address",
  "source_capture_timeout",
  "source_capture_fetch_failed",
  "source_capture_http_error",
  "source_capture_redirect_limit",
  "source_capture_unsupported_content",
  "source_capture_too_large",
  "source_capture_incomplete",
  "source_capture_challenge",
  "source_capture_invalid_encoding",
  "source_capture_empty",
] as const;

export const capturedPageSchema = z
  .object({
    evidence_kind: z.literal("source_page_text_v1"),
    source_url: z.string().max(2048),
    retrieval_url: z.string().max(2048),
    final_url: z.string().max(2048),
    fetched_at: z.iso.datetime({ offset: true }),
    http_status: z.literal(200),
    content_type: z.enum([
      "text/html",
      "application/xhtml+xml",
      "application/json",
      "application/ld+json",
      "text/plain",
    ]),
    response_bytes: z
      .number()
      .int()
      .min(1)
      .max(SOURCE_CAPTURE_LIMITS.responseBytes),
    redirects: z.number().int().min(0).max(SOURCE_CAPTURE_LIMITS.redirects),
    body_hash: z.string().regex(/^[a-f0-9]{64}$/),
    text_hash: z.string().regex(/^[a-f0-9]{64}$/),
    text: z.string().min(40).max(SOURCE_CAPTURE_LIMITS.textCharacters),
  })
  .strict();
export type CapturedSourcePage = z.infer<typeof capturedPageSchema>;

export const captureDiagnosticSchema = z
  .object({
    source_id: z.string().uuid(),
    status: z.enum(["captured", "failed"]),
    error_code: z.enum(CAPTURE_ERROR_CODES).nullable(),
    http_status: z.number().int().min(100).max(599).nullable(),
    content_type: capturedPageSchema.shape.content_type.nullable(),
    response_bytes: z
      .number()
      .int()
      .min(0)
      .max(SOURCE_CAPTURE_LIMITS.responseBytes)
      .nullable(),
    redirects: z.number().int().min(0).max(SOURCE_CAPTURE_LIMITS.redirects),
  })
  .strict();
export type SourceCaptureDiagnostic = z.infer<typeof captureDiagnosticSchema>;
export type CaptureDetails = Omit<
  SourceCaptureDiagnostic,
  "source_id" | "status" | "error_code"
>;

/** Canonical identity stays stable; preserve only a permitted cited hostname. */
export function sourceRetrievalUrl(
  input: string,
  source: SourceIdentity,
): string {
  if (
    publicListingUrl(source.source_url) !== source.source_url ||
    /[\s\x00-\x1f\x7f\\]/u.test(input) ||
    sourceIdentity(input)?.source_url !== source.source_url
  )
    throw new IngestionError("source_capture_blocked_url");
  const original = new URL(input);
  const clean = new URL(source.source_url);
  clean.hostname = original.hostname;
  return clean.toString();
}

function hash(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Validate a private snapshot before it can replace the historical report path. */
export function validateCapturedPages(
  pages: unknown,
  sources: SourceIdentity[],
): CapturedSourcePage[] {
  const parsed = z
    .array(capturedPageSchema)
    .min(1)
    .max(SOURCE_CAPTURE_LIMITS.sources)
    .safeParse(pages);
  if (!parsed.success || parsed.data.length !== sources.length)
    throw new IngestionError("invalid_source_evidence");
  const seen = new Set<string>();
  let characters = 0;
  for (const page of parsed.data) {
    const source = sources.find((item) => item.source_url === page.source_url);
    if (
      !source ||
      seen.has(page.source_url) ||
      hash(page.text) !== page.text_hash ||
      sourceRetrievalUrl(page.retrieval_url, source) !== page.retrieval_url ||
      sourceRetrievalUrl(page.final_url, source) !== page.final_url
    )
      throw new IngestionError("invalid_source_evidence");
    seen.add(page.source_url);
    characters += page.text.length;
  }
  if (characters > SOURCE_CAPTURE_LIMITS.totalTextCharacters)
    throw new IngestionError("invalid_source_evidence");
  return parsed.data;
}

export function safeCaptureDiagnostics(
  input: unknown,
): SourceCaptureDiagnostic[] {
  return Array.isArray(input)
    ? input.slice(0, SOURCE_CAPTURE_LIMITS.sources).flatMap((item) => {
        const parsed = captureDiagnosticSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
}

/** Decode only fixed/numeric HTML entities; unknown entities remain unchanged. */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
  };
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (original: string, entity: string) => {
      if (!entity.startsWith("#"))
        return Object.hasOwn(named, entity.toLowerCase())
          ? named[entity.toLowerCase()]
          : original;
      const number = entity.toLowerCase().startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return number > 0 &&
        number <= 0x10ffff &&
        !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number)
        : original;
    },
  );
}

/** Retain recognized public event fields, including nested addresses and offers. */
function eventFieldValue(
  input: unknown,
  depth = 0,
  budget = { nodes: 0 },
): unknown {
  if (++budget.nodes > 2000 || depth > 8)
    throw new IngestionError("source_capture_incomplete");
  if (input === null || typeof input === "string" || typeof input === "boolean")
    return input;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (Array.isArray(input)) {
    if (input.length > 20)
      throw new IngestionError("source_capture_incomplete");
    return input.map((value) => eventFieldValue(value, depth + 1, budget));
  }
  if (!input || typeof input !== "object")
    throw new IngestionError("source_capture_incomplete");
  const fields = new Set([
    "@type",
    "@id",
    "name",
    "description",
    "url",
    "address",
    "streetAddress",
    "addressLocality",
    "addressRegion",
    "postalCode",
    "addressCountry",
    "geo",
    "latitude",
    "longitude",
    "price",
    "priceCurrency",
    "availability",
    "validFrom",
    "validThrough",
    "seller",
    "offeredBy",
    "offers",
    "location",
    "organizer",
    "performer",
    "startDate",
    "endDate",
    "eventStatus",
    "eventAttendanceMode",
  ]);
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => fields.has(key))
      .map(([key, value]) => [key, eventFieldValue(value, depth + 1, budget)]),
  );
}

/** Collect bounded Event JSON-LD only, not framework state, secrets or arbitrary scripts. */
function eventData(input: unknown): unknown[] {
  const found: unknown[] = [];
  let nodes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > 2000 || depth > 16)
      throw new IngestionError("source_capture_incomplete");
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record["@type"])
      ? record["@type"]
      : [record["@type"]];
    if (
      types.some(
        (type) =>
          typeof type === "string" &&
          /^(?:https?:\/\/schema\.org\/)?(?:Event|[A-Za-z]+Event)$/.test(type),
      )
    ) {
      const keys = [
        "@type",
        "name",
        "description",
        "startDate",
        "endDate",
        "eventStatus",
        "eventAttendanceMode",
        "location",
        "organizer",
        "performer",
        "offers",
        "url",
      ];
      found.push(
        Object.fromEntries(
          keys
            .filter((key) => key in record)
            .map((key) => [key, eventFieldValue(record[key])]),
        ),
      );
      if (found.length > 10)
        throw new IngestionError("source_capture_incomplete");
    } else for (const child of Object.values(record)) visit(child, depth + 1);
  }
  visit(input, 0);
  return found;
}

function htmlEventData(html: string): unknown[] {
  const found: unknown[] = [];
  let count = 0;
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1])) continue;
    if (++count > 20 || match[2].length > 65536)
      throw new IngestionError("source_capture_incomplete");
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[2]);
    } catch {
      throw new IngestionError("source_capture_incomplete");
    }
    found.push(...eventData(parsed));
  }
  return found;
}

/** Static text extraction, not a browser render or authenticated page archive. */
export function extractSourceText(
  body: string,
  contentType: CapturedSourcePage["content_type"],
): string {
  let text: string;
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    if (/<title[^>]*>\s*(?:sign in|log in|login)\b/i.test(body))
      throw new IngestionError("source_capture_challenge");
    const html = body.replace(/<!--[\s\S]*?-->/g, " ");
    for (const tag of ["script", "style", "noscript", "iframe", "template"]) {
      const opened =
        html.match(new RegExp(`<${tag}\\b[^>]*>`, "gi"))?.length ?? 0;
      const closed = html.match(new RegExp(`</${tag}\\s*>`, "gi"))?.length ?? 0;
      if (opened !== closed)
        throw new IngestionError("source_capture_incomplete");
    }
    const data = htmlEventData(html);
    const visible = html
      .replace(
        /<(script|style|noscript|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        " ",
      )
      .replace(/<[^>]*>/g, " ");
    text =
      decodeEntities(visible) +
      (data.length ? "\nStructured event data:\n" + JSON.stringify(data) : "");
  } else if (
    contentType === "application/json" ||
    contentType === "application/ld+json"
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new IngestionError("source_capture_incomplete");
    }
    const data = eventData(parsed);
    if (!data.length) throw new IngestionError("source_capture_incomplete");
    text = JSON.stringify(data);
  } else text = body;
  text = text.replace(/\s+/gu, " ").trim();
  if (
    /verify you are human|checking your browser|enable javascript and cookies|access denied|captcha/i.test(
      text,
    )
  )
    throw new IngestionError("source_capture_challenge");
  if (text.length < 40) throw new IngestionError("source_capture_empty");
  if (text.length > SOURCE_CAPTURE_LIMITS.textCharacters)
    throw new IngestionError("source_capture_too_large");
  return text;
}
