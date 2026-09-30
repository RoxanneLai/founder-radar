import "server-only";
import type {
  ProviderDiagnostic,
  StructuredOutputDiagnostic,
} from "./contracts.ts";
import { IngestionError } from "./errors.ts";

const MAX_INSPECTION_CHARACTERS = 65536;
const MAX_CONTAINER_DEPTH = 128;

function jsonFormat(value: unknown): StructuredOutputDiagnostic["format"] {
  return Array.isArray(value)
    ? "json_array"
    : value !== null && typeof value === "object"
      ? "json_object"
      : "json_scalar";
}

/** Structural hint only: ignore brackets inside strings, never infer valid JSON. */
function incompleteContainer(text: string): boolean | null {
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === "{" || character === "[") {
      if (stack.length >= MAX_CONTAINER_DEPTH) return null;
      stack.push(character);
    } else if (character === "}" || character === "]") {
      if (stack.pop() !== (character === "}" ? "{" : "[")) return null;
    }
  }
  return inString || stack.length > 0;
}

function validJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Inspect a complete standalone fence only; never return or accept its contents. */
function inspectFence(
  text: string,
  diagnostic: StructuredOutputDiagnostic,
): boolean {
  const match = text.match(/^(```|~~~)([^\r\n]*)\r?\n([\s\S]*)\r?\n\1$/);
  if (!match || /^\s*(?:```|~~~)/m.test(match[3])) return false;
  diagnostic.format = "single_code_fence";
  const language = match[2].trim().toLowerCase();
  diagnostic.fence_language =
    language === "json" ? "json" : language === "" ? "unlabelled" : "other";
  diagnostic.fence_json_valid = validJson(match[3]);
  diagnostic.structure_incomplete = incompleteContainer(match[3].trim());
  return true;
}

/** Fixed categories/booleans only; no text, parse-error messages or positions escape. */
function invalidFormat(content: string | null): StructuredOutputDiagnostic {
  const prefix = content?.slice(0, MAX_INSPECTION_CHARACTERS) ?? "";
  const diagnostic: StructuredOutputDiagnostic = {
    parse_status: "invalid",
    format: content === null ? "missing" : "empty",
    fence_language: null,
    fence_json_valid: null,
    structure_incomplete: null,
    leading_bom: /^[\t\n\r ]*\uFEFF/.test(prefix),
    inspection_truncated: (content?.length ?? 0) > MAX_INSPECTION_CHARACTERS,
  };
  if (content === null) return diagnostic;
  const text = prefix.trim();
  if (!text) return diagnostic;
  if (!diagnostic.inspection_truncated && inspectFence(text, diagnostic))
    return diagnostic;
  diagnostic.format = text.startsWith("{")
    ? "object_like"
    : text.startsWith("[")
      ? "array_like"
      : /```|~~~|[\[{]/.test(text)
        ? "mixed_text"
        : "text";
  if (!diagnostic.inspection_truncated)
    diagnostic.structure_incomplete = incompleteContainer(text);
  return diagnostic;
}

/** Preserve strict parsing and failure codes; probes classify only, never repair. */
export function parseStructuredContent(
  content: string | null,
  diagnostic: ProviderDiagnostic,
  failureCode: "invalid_extraction_json" | "invalid_repair_json",
): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content ?? "");
  } catch {
    diagnostic.structured_output = invalidFormat(content);
    throw new IngestionError(failureCode);
  }
  diagnostic.structured_output = {
    parse_status: "valid",
    format: jsonFormat(parsed),
    fence_language: null,
    fence_json_valid: null,
    structure_incomplete:
      parsed !== null && typeof parsed === "object" ? false : null,
    leading_bom: false,
    inspection_truncated: false,
  };
  return parsed;
}
