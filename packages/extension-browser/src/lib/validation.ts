/**
 * validation.ts
 *
 * Validates LLM completions against the MCP translation output schemas.
 *
 * **CSP-safe path (the only path).** Chrome MV3 forbids `unsafe-eval`.
 * `Ajv.compile(schema)` at runtime calls `new Function(generatedCode)`,
 * which is `eval` — so before this fix every translation response failed
 * validation silently with `EvalError: Evaluating a string as JavaScript
 * violates the following Content Security Policy directive...` and the
 * extension showed no result.
 *
 * Resolution: the four output schemas are pre-compiled at build time by
 * `scripts/compile-schemas.ts` into `schemas/compiled-validators.js`
 * via Ajv's standalone code generator. This module imports those compiled
 * validator functions directly — no `new Function`, no `eval`.
 *
 * `outputSchemaSnippet()` is still synthesised here for prompt assembly
 * (the LLM gets the schema in-band), using the same lifting logic that
 * `compile-schemas.ts` uses at build time.
 */
import translateIncoming from "./schemas/translate_incoming.schema.json" assert { type: "json" };
import checkTone from "./schemas/check_tone.schema.json" assert { type: "json" };
import rewriteOutgoing from "./schemas/rewrite_outgoing.schema.json" assert { type: "json" };
import briefMeeting from "./schemas/brief_meeting.schema.json" assert { type: "json" };
import describeImage from "./schemas/describe_image.schema.json" assert { type: "json" };
import {
  validate_translate_incoming,
  validate_check_tone,
  validate_rewrite_outgoing,
  validate_brief_meeting,
  validate_describe_image,
  type ValidateFn,
} from "./schemas/compiled-validators.js";
import type { ModelProvenance, TranslationTool } from "./types.js";

type JsonSchema = Record<string, unknown>;

const RAW_SCHEMAS: Record<TranslationTool, JsonSchema> = {
  translate_incoming: translateIncoming as unknown as JsonSchema,
  check_tone: checkTone as unknown as JsonSchema,
  rewrite_outgoing: rewriteOutgoing as unknown as JsonSchema,
  brief_meeting: briefMeeting as unknown as JsonSchema,
  describe_image: describeImage as unknown as JsonSchema,
};

const VALIDATORS: Record<TranslationTool, ValidateFn> = {
  translate_incoming: validate_translate_incoming,
  check_tone: validate_check_tone,
  rewrite_outgoing: validate_rewrite_outgoing,
  brief_meeting: validate_brief_meeting,
  describe_image: validate_describe_image,
};

export interface ValidationResult<T = unknown> {
  readonly ok: boolean;
  readonly data: T | null;
  readonly errors: readonly string[];
}

function buildOutputSchema(tool: TranslationTool): JsonSchema {
  const raw = RAW_SCHEMAS[tool];
  const properties = (raw.properties ?? {}) as Record<string, unknown>;
  const output = (properties.output ?? {}) as JsonSchema;
  const defs = (raw.$defs ?? {}) as JsonSchema;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...output,
    $defs: defs,
  };
}

export function _resetValidatorsForTests(): void {
  // Validators are precompiled and stateless; nothing to reset. Kept for
  // backwards compatibility with existing tests.
}

export function validateOutput<T = unknown>(
  tool: TranslationTool,
  candidate: unknown,
): ValidationResult<T> {
  const validate = VALIDATORS[tool];
  const ok = validate(candidate);
  if (ok) return { ok: true, data: candidate as T, errors: [] };
  return {
    ok: false,
    data: null,
    errors: formatErrors(validate.errors ?? []),
  };
}

export function parseAndValidate<T = unknown>(
  tool: TranslationTool,
  rawText: string,
  provenance?: ModelProvenance,
): ValidationResult<T> {
  const extracted = extractJson(rawText);
  if (extracted === null) {
    return {
      ok: false,
      data: null,
      errors: ["Could not locate a JSON object in the model completion."],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch (cause: unknown) {
    return {
      ok: false,
      data: null,
      errors: [
        `JSON parse error: ${
          cause instanceof Error ? cause.message : "unknown"
        }`,
      ],
    };
  }
  const normalised = provenance
    ? normaliseLLMOutput(tool, parsed, provenance)
    : parsed;
  return validateOutput<T>(tool, normalised);
}

/**
 * Coerce a parsed LLM completion into a shape the schema validator will
 * accept. Solves two recurring local-model failure modes:
 *
 *   1. **Server-owned fields the LLM can't honestly produce.** Every
 *      output schema requires `eval_corpus_slice` and `model_provenance`
 *      (per ADR 0005 — the server owns provenance, not the model). Local
 *      models routinely omit both, and asking them to invent these via
 *      prompt is the wrong shape: they'd hallucinate the values. Instead,
 *      inject the constants here. The validator then sees a schema-shaped
 *      object and the public schema contract still holds.
 *
 *   2. **Boolean / numeric type drift.** Small local models return
 *      `"true"` / `"false"` (strings) for boolean fields and string
 *      numbers for confidence scores. Coerce known shapes so an
 *      otherwise-correct response isn't rejected on a stringification
 *      quibble.
 *
 * Anything we can't coerce safely is left alone — the validator surfaces
 * the real issue rather than us guessing.
 */
export function normaliseLLMOutput(
  tool: TranslationTool,
  parsed: unknown,
  provenance: ModelProvenance,
): unknown {
  if (!isObject(parsed)) return parsed;
  const out: Record<string, unknown> = { ...parsed };

  if (!isObject(out.model_provenance)) {
    out.model_provenance = {
      mode: provenance.mode,
      provider: provenance.provider,
      model: provenance.model,
    };
  }
  if (typeof out.eval_corpus_slice !== "string") {
    out.eval_corpus_slice = EVAL_CORPUS_SLICES[tool];
  }

  if (tool === "describe_image") {
    out.contains_text = coerceBoolean(out.contains_text);
    if (!Array.isArray(out.key_elements)) out.key_elements = [];
    if (out.transcribed_text === undefined) out.transcribed_text = null;
    if (out.accessibility_notes === undefined) out.accessibility_notes = null;
  }
  if (tool === "translate_incoming") {
    if (!Array.isArray(out.likely_subtext)) out.likely_subtext = [];
    if (out.explicit_ask === undefined) out.explicit_ask = null;
  }

  return out;
}

const EVAL_CORPUS_SLICES: Record<TranslationTool, string> = {
  translate_incoming: "translate_incoming-v0.1.0",
  check_tone: "check_tone-v0.1.0",
  rewrite_outgoing: "rewrite_outgoing-v0.1.0",
  brief_meeting: "brief_meeting-v0.1.0",
  describe_image: "describe_image-v0.1.0",
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function coerceBoolean(x: unknown): unknown {
  if (typeof x === "boolean") return x;
  if (typeof x === "string") {
    const lower = x.trim().toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    if (lower === "false" || lower === "no" || lower === "0") return false;
  }
  return x;
}

export function extractJson(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return null;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) return fence[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

interface ErrorObjectLike {
  readonly instancePath: string;
  readonly message?: string;
}

function formatErrors(errors: ReadonlyArray<ErrorObjectLike>): string[] {
  return errors.map((e) => {
    const path = e.instancePath.length > 0 ? e.instancePath : "(root)";
    return `${path}: ${e.message ?? "validation error"}`;
  });
}

export function outputSchemaSnippet(tool: TranslationTool): string {
  return JSON.stringify(buildOutputSchema(tool), null, 2);
}
