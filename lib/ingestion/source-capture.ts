import "server-only";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { createHash } from "node:crypto";
import type { LookupAddress } from "node:dns";
import type { IncomingMessage } from "node:http";
import type { SourceIdentity } from "./contracts.ts";
import { IngestionError } from "./errors.ts";
import {
  capturedPageSchema,
  extractSourceText,
  SOURCE_CAPTURE_LIMITS,
  sourceRetrievalUrl,
} from "./source-page.ts";
import type {
  CapturedSourcePage,
  CaptureDetails,
  SourceCaptureDiagnostic,
} from "./source-page.ts";

type PageResponse = {
  status: number;
  headers: Record<string, string | undefined>;
  body: Uint8Array;
};
type CaptureDependencies = {
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
  request?: (
    url: URL,
    address: LookupAddress,
    signal: AbortSignal,
  ) => Promise<PageResponse>;
  now?: () => Date;
};

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(network, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicCaptureAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}

class CaptureError extends IngestionError {
  readonly details: CaptureDetails;
  constructor(code: string, details: CaptureDetails) {
    super(code);
    this.details = { ...details };
  }
}

export function captureFailureDetails(error: unknown): CaptureDetails {
  return error instanceof CaptureError
    ? error.details
    : {
        http_status: null,
        content_type: null,
        response_bytes: null,
        redirects: 0,
      };
}

/** Bound DNS or injected transport even when the underlying promise ignores abort. */
async function withinSignal<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    void work.catch(() => {});
    throw new IngestionError("source_capture_timeout");
  }
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new IngestionError("source_capture_timeout"));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function header(response: IncomingMessage, name: string): string | undefined {
  const value = response.headers[name];
  return typeof value === "string" ? value : undefined;
}

async function readPageResponse(
  response: IncomingMessage,
): Promise<PageResponse> {
  const status = response.statusCode ?? 0;
  const headers = Object.fromEntries(
    ["location", "content-type", "content-length", "content-encoding"].map(
      (key) => [key, header(response, key)],
    ),
  );
  if (status !== 200) {
    response.destroy();
    return { status, headers, body: new Uint8Array() };
  }
  const length = headers["content-length"];
  if (
    length &&
    (!/^\d+$/.test(length) ||
      Number(length) > SOURCE_CAPTURE_LIMITS.responseBytes)
  ) {
    response.destroy();
    throw new IngestionError("source_capture_too_large");
  }
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for await (const chunk of response) {
      if (!Buffer.isBuffer(chunk))
        throw new IngestionError("source_capture_incomplete");
      bytes += chunk.length;
      if (bytes > SOURCE_CAPTURE_LIMITS.responseBytes)
        throw new IngestionError("source_capture_too_large");
      chunks.push(chunk);
    }
    if (!response.complete || (length && Number(length) !== bytes))
      throw new IngestionError("source_capture_incomplete");
    return { status, headers, body: Buffer.concat(chunks) };
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw new IngestionError("source_capture_incomplete");
  } finally {
    response.destroy();
  }
}

/** Pin a validated DNS result to a fresh TLS connection; never use proxy/cookies/auth. */
function requestPinnedPage(
  url: URL,
  address: LookupAddress,
  signal: AbortSignal,
): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = https.request(
      url,
      {
        method: "GET",
        agent: false,
        rejectUnauthorized: true,
        servername: url.hostname,
        family: address.family,
        signal,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/ld+json,application/json,text/plain",
          "accept-encoding": "identity",
          "user-agent": "RightRoom/0.1 (public event evidence capture)",
        },
      },
      (response) => {
        void readPageResponse(response).then(resolve, reject);
      },
    );
    outgoing.on("error", () =>
      reject(new IngestionError("source_capture_fetch_failed")),
    );
    outgoing.end();
  });
}

async function captureRedirectChain(
  source: SourceIdentity,
  initial: string,
  signal: AbortSignal,
  details: CaptureDetails,
  deps: CaptureDependencies,
): Promise<{ url: string; response: PageResponse }> {
  let current = sourceRetrievalUrl(initial, source);
  const seen = new Set<string>();
  for (;;) {
    if (signal.aborted) throw new IngestionError("source_capture_timeout");
    if (seen.has(current))
      throw new IngestionError("source_capture_redirect_limit");
    seen.add(current);
    const url = new URL(current);
    const addresses = await withinSignal(
      (deps.resolve ?? ((host) => lookup(host, { all: true, verbatim: true })))(
        url.hostname,
      ),
      signal,
    );
    if (
      !addresses.length ||
      addresses.some(
        (address) =>
          !isPublicCaptureAddress(address.address) ||
          isIP(address.address) !== address.family,
      )
    )
      throw new IngestionError("source_capture_blocked_address");
    if (signal.aborted) throw new IngestionError("source_capture_timeout");
    const response = await withinSignal(
      (deps.request ?? requestPinnedPage)(url, addresses[0], signal),
      signal,
    );
    details.http_status =
      response.status >= 100 && response.status <= 599 ? response.status : null;
    const mime = (response.headers["content-type"] ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const parsedMime = capturedPageSchema.shape.content_type.safeParse(mime);
    details.content_type = parsedMime.success ? parsedMime.data : null;
    details.response_bytes =
      response.body.length <= SOURCE_CAPTURE_LIMITS.responseBytes
        ? response.body.length
        : null;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (
        details.redirects >= SOURCE_CAPTURE_LIMITS.redirects ||
        !response.headers.location
      )
        throw new IngestionError("source_capture_redirect_limit");
      const next = new URL(response.headers.location, url);
      // Inspect the destination before sanitizing: an identity alias is okay, secret-bearing queries are not forwarded.
      current = sourceRetrievalUrl(next.toString(), source);
      details.redirects += 1;
    } else return { url: current, response };
  }
}

/** One bounded capture with same-identity redirects, no retries or fallback renderer. */
export async function captureSourcePage(
  source: SourceIdentity,
  retrievalUrl: string,
  signal: AbortSignal,
  deps: CaptureDependencies = {},
): Promise<CapturedSourcePage> {
  if (signal.aborted) throw new IngestionError("run_cancelled");
  const bounded = AbortSignal.any([
    signal,
    AbortSignal.timeout(SOURCE_CAPTURE_LIMITS.timeoutMs),
  ]);
  const details: CaptureDetails = {
    http_status: null,
    content_type: null,
    response_bytes: null,
    redirects: 0,
  };
  try {
    const initial = sourceRetrievalUrl(retrievalUrl, source);
    const result = await captureRedirectChain(
      source,
      initial,
      bounded,
      details,
      deps,
    );
    const { response } = result;
    if (response.status !== 200)
      throw new IngestionError("source_capture_http_error");
    if (
      !details.content_type ||
      (response.headers["content-encoding"] &&
        response.headers["content-encoding"] !== "identity")
    )
      throw new IngestionError("source_capture_unsupported_content");
    const charset = response.headers["content-type"]?.match(
      /;\s*charset\s*=\s*["']?([^;\s"']+)/i,
    )?.[1];
    if (
      charset &&
      !["utf-8", "utf8", "us-ascii"].includes(charset.toLowerCase())
    )
      throw new IngestionError("source_capture_invalid_encoding");
    if (response.body.length > SOURCE_CAPTURE_LIMITS.responseBytes)
      throw new IngestionError("source_capture_too_large");
    let body: string;
    try {
      body = new TextDecoder("utf-8", { fatal: true }).decode(response.body);
    } catch {
      throw new IngestionError("source_capture_invalid_encoding");
    }
    const text = extractSourceText(body, details.content_type);
    const digest = (value: string | Uint8Array) =>
      createHash("sha256").update(value).digest("hex");
    return capturedPageSchema.parse({
      evidence_kind: "source_page_text_v1",
      source_url: source.source_url,
      retrieval_url: initial,
      final_url: result.url,
      fetched_at: (deps.now ?? (() => new Date()))().toISOString(),
      http_status: 200,
      content_type: details.content_type,
      response_bytes: response.body.length,
      redirects: details.redirects,
      body_hash: digest(response.body),
      text_hash: digest(text),
      text,
    });
  } catch (error) {
    if (signal.aborted) throw new IngestionError("run_cancelled");
    const code = bounded.aborted
      ? "source_capture_timeout"
      : error instanceof IngestionError
        ? error.code
        : "source_capture_fetch_failed";
    throw new CaptureError(code, details);
  }
}

export function capturedPageDiagnostic(
  page: CapturedSourcePage,
): Omit<SourceCaptureDiagnostic, "source_id"> {
  return {
    status: "captured",
    error_code: null,
    http_status: page.http_status,
    content_type: page.content_type,
    response_bytes: page.response_bytes,
    redirects: page.redirects,
  };
}
