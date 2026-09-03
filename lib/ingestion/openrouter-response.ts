import "server-only";
import { z } from "zod";
import type { Json } from "../database.types.ts";
import type { ProviderDiagnostic } from "./contracts.ts";
import { IngestionError } from "./errors.ts";

const count = z.number().int().nonnegative();
const responseSchema = z.object({
  id: z.string().min(1).max(256),
  model: z.string().min(1).max(256),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().nullable(),
          refusal: z.string().nullish(),
          tool_calls: z.array(z.unknown()).nullish(),
          annotations: z
            .array(
              z.object({
                type: z.string(),
                url_citation: z
                  .object({ url: z.string().max(4096) })
                  .optional(),
              }),
            )
            .max(100)
            .nullish(),
        }),
      }),
    )
    .length(1),
  usage: z
    .object({
      prompt_tokens: count.nullish(),
      completion_tokens: count.nullish(),
      input_tokens: count.nullish(),
      output_tokens: count.nullish(),
      total_tokens: count.nullish(),
      cost: z.number().nonnegative().nullish(),
      server_tool_use: z
        .object({ web_search_requests: count.nullish() })
        .nullish(),
    })
    .nullish(),
});
export type RouterResponse = z.infer<typeof responseSchema>;

export function providerHttpError(status: number): IngestionError {
  if (status === 402 || status === 429)
    return new IngestionError("provider_quota_or_rate_limit");
  if (status === 401 || status === 403)
    return new IngestionError("provider_authentication_failed");
  return new IngestionError("provider_request_failed");
}

/** OpenRouter can return an error envelope even with HTTP 200. Do not echo it. */
export function parseRouterResponse(value: unknown): RouterResponse {
  if (value && typeof value === "object" && "error" in value && value.error) {
    const parsed = z
      .object({ code: z.union([z.number(), z.string()]) })
      .safeParse(value.error);
    throw providerHttpError(parsed.success ? Number(parsed.data.code) : 500);
  }
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new IngestionError("invalid_provider_response");
  const choice = parsed.data.choices[0];
  if (choice.message.refusal || choice.finish_reason === "content_filter")
    throw new IngestionError("provider_refused");
  if (choice.finish_reason !== "stop" || choice.message.tool_calls?.length)
    throw new IngestionError("provider_incomplete");
  return parsed.data;
}

/** Bound bytes before parsing, including responses whose Content-Length is absent. */
export async function readResponseJson(
  response: Response,
  limit: number,
): Promise<unknown> {
  if (!response.body) throw new IngestionError("invalid_provider_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new IngestionError("provider_response_too_large");
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new IngestionError("invalid_provider_response");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function routerMetadata(
  response: RouterResponse,
  requestedModel: string,
  diagnostic?: ProviderDiagnostic,
): Json {
  const usage = response.usage;
  return {
    provider: "openrouter",
    response_id: response.id,
    requested_model: requestedModel,
    model: response.model,
    status: "completed",
    usage: usage
      ? {
          input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
          output_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
          total_tokens: usage.total_tokens ?? null,
          cost: usage.cost ?? null,
        }
      : null,
    search_tool_calls: usage?.server_tool_use?.web_search_requests ?? null,
    ...(diagnostic?.search_verification
      ? { search_verification: diagnostic.search_verification }
      : {}),
  };
}
