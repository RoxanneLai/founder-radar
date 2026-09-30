import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredContent } from "../../lib/ingestion/structured-output.ts";
import { routerDiagnostic } from "../../lib/ingestion/openrouter-diagnostics.ts";

const privateText = "PRIVATE_SOURCE_SECRET_REASONING_TRACE";

function diagnostic(phase = "extraction") {
  return routerDiagnostic(
    null,
    phase,
    "vendor/offline",
    "medium",
    "synthetic-key",
  );
}

function rejected(content, code = "invalid_extraction_json") {
  const result = diagnostic(
    code === "invalid_repair_json" ? "repair" : "extraction",
  );
  assert.throws(() => parseStructuredContent(content, result, code), { code });
  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE_SOURCE|SECRET|REASONING_TRACE|SyntaxError|Unexpected/,
  );
  return result.structured_output;
}

test("strict JSON parsing preserves values but diagnostics contain fixed categories only", () => {
  for (const [value, format] of [
    [{ candidates: [], private: privateText }, "json_object"],
    [[privateText], "json_array"],
    [privateText, "json_scalar"],
    [null, "json_scalar"],
    [42, "json_scalar"],
    [true, "json_scalar"],
  ]) {
    const result = diagnostic();
    assert.deepEqual(
      parseStructuredContent(
        " \n" + JSON.stringify(value) + "\t ",
        result,
        "invalid_extraction_json",
      ),
      value,
    );
    assert.equal(result.structured_output.parse_status, "valid");
    assert.equal(result.structured_output.format, format);
    assert.equal(result.structured_output.fence_json_valid, null);
    assert.equal(result.structured_output.inspection_truncated, false);
    assert.doesNotMatch(
      JSON.stringify(result),
      /PRIVATE_SOURCE|SECRET|REASONING_TRACE/,
    );
  }
  assert.equal(diagnostic("research").structured_output, null);
});

test("missing, empty, prose, malformed JSON, and BOM responses are distinguishable without error text", () => {
  for (const [content, format, incomplete] of [
    [null, "missing", null],
    [" \r\n\t", "empty", null],
    ["Explanation " + privateText, "text", null],
    ['{"value":' + JSON.stringify(privateText) + ",}", "object_like", false],
    ['{"value":' + JSON.stringify(privateText), "object_like", true],
    ['{"value":"' + privateText, "object_like", true],
    ["[1,2,", "array_like", true],
    ["[1,2,]", "array_like", false],
    ["[{]", "array_like", null],
    ['{"value":"brackets [ ] { } and escaped quote \\""', "object_like", true],
  ]) {
    const result = rejected(content);
    assert.equal(result.parse_status, "invalid");
    assert.equal(result.format, format);
    assert.equal(result.structure_incomplete, incomplete);
    assert.equal(result.leading_bom, false);
  }
  const bom = rejected(" \n\uFEFF" + JSON.stringify({ value: privateText }));
  assert.equal(bom.leading_bom, true);
  assert.equal(bom.format, "object_like");
  assert.equal(bom.structure_incomplete, false);
});

test("complete single code fences are probed for diagnosis only, never stripped or accepted", () => {
  for (const [opening, language] of [
    ["```json", "json"],
    ["```JSON", "json"],
    ["~~~json", "json"],
    ["```", "unlabelled"],
    ["```" + privateText, "other"],
  ]) {
    const closing = opening.startsWith("~~~") ? "~~~" : "```";
    const result = rejected(
      opening +
        "\r\n" +
        JSON.stringify({ value: privateText }) +
        "\r\n" +
        closing,
    );
    assert.equal(result.format, "single_code_fence");
    assert.equal(result.fence_language, language);
    assert.equal(result.fence_json_valid, true);
    assert.equal(result.structure_incomplete, false);
  }
  const invalidFence = rejected('```json\n{"value":"' + privateText + "\n```");
  assert.equal(invalidFence.format, "single_code_fence");
  assert.equal(invalidFence.fence_json_valid, false);
  assert.equal(invalidFence.structure_incomplete, true);
});

test("mixed text, partial fences, concatenated objects and multiple fences never become accepted subtrees", () => {
  const json = JSON.stringify({ value: privateText });
  for (const content of [
    "Result:\n```json\n" + json + "\n```",
    "```json\n" + json + "\n```\nExplanation " + privateText,
    "```json\n" + json,
    "```json\n" + json + "\n```\n```json\n" + json + "\n```",
    "Explanation " + privateText + " " + json,
  ]) {
    const result = rejected(content);
    assert.equal(result.format, "mixed_text");
    assert.equal(result.fence_json_valid, null);
    assert.equal(result.fence_language, null);
  }
  assert.equal(rejected(json + json).format, "object_like");
});

test("diagnostic scanning is bounded and never mistakes an inspection cutoff for provider truncation", () => {
  const result = rejected('{"value":"' + "x".repeat(65536) + privateText);
  assert.equal(result.inspection_truncated, true);
  assert.equal(result.format, "object_like");
  assert.equal(result.structure_incomplete, null);
  assert.equal(result.fence_json_valid, null);
  assert.ok(JSON.stringify(result).length < 400);
  const deep = rejected("[".repeat(129) + privateText);
  assert.equal(deep.structure_incomplete, null);
  assert.equal(deep.inspection_truncated, false);
  const longFence = rejected(
    "```json\n" + JSON.stringify({ value: "x".repeat(65536) }) + "\n```",
  );
  assert.equal(longFence.inspection_truncated, true);
  assert.equal(longFence.fence_json_valid, null);
});

test("repair syntax errors retain their existing code and safe classification", () => {
  const result = rejected(
    "```json\n" + JSON.stringify({ value: privateText }) + "\n```",
    "invalid_repair_json",
  );
  assert.equal(result.parse_status, "invalid");
  assert.equal(result.format, "single_code_fence");
  assert.equal(result.fence_json_valid, true);
});
