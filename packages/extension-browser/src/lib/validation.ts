/**
 * validation.ts
 *
 * Ajv-based validation of LLM completions against the MCP translation
 * output schemas. The schemas are mirrored at build time from
 * packages/mcp-translation/schemas via scripts/sync-schemas.ts.
 *
 * Each tool's schema has the shape:
 *   { "type": "object",
 *     "properties": { "input": {...}, "output": {...} },
 *     "$defs": { ... } }
 *
 * For runtime validation we want ONLY the `output` sub-schema, but the
 * `$defs` references resolve against the root document. We synthesise a
 * standalone schema by lifting `properties.output` to the root and
 * carrying `$defs` with it. `$id`s are dropped to avoid Ajv complaining
 * about duplicate ids.
 */
import Ajv2020, { type ValidateFunction, type ErrorObject } from "ajv/dist/2020.js";
import translateIncoming from "./schemas/translate_incoming.schema.json" with { type: "json" };
import checkTone from "./schemas/check_tone.schema.json" with { type: "json" };
import rewriteOutgoing from "./schemas/rewrite_outgoing.schema.json" with { type: "json" };
import briefMeeting from "./schemas/brief_meeting.schema.json" with { type: "json" };
import type { TranslationTool } from "./types.js";

type JsonSchema = Record<string, unknown>;

const RAW_SCHEMAS: Record<TranslationTool, JsonSchema> = {
  translate_incoming: translateIncoming as unknown as JsonSchema,
  check_tone: checkTone as unknown as JsonSchema,
  rewrite_outgoing: rewriteOutgoing as unknown as JsonSchema,
  brief_meeting: briefMeeting as unknown as JsonSchema,
};

export interface ValidationResult<T = unknown> {
  readonly ok: boolean;
  readonly data: T | null;
  readonly errors: readonly string[];
}

let cachedValidators: Partial<Record<TranslationTool, ValidateFunction>> = {};

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

function getValidator(tool: TranslationTool): ValidateFunction {
  const cached = cachedValidators[tool];
  if (cached) return cached;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const compiled = ajv.compile(buildOutputSchema(tool));
  cachedValidators = { ...cachedValidators, [tool]: compiled };
  return compiled;
}

export function _resetValidatorsForTests(): void {
  cachedValidators = {};
}

export function validateOutput<T = unknown>(
  tool: TranslationTool,
  candidate: unknown
): ValidationResult<T> {
  const validate = getValidator(tool);
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
  rawText: string
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
  try { parsed = JSON.parse(extracted); }
  catch (cause: unknown) {
    return {
      ok: false,
      data: null,
      errors: [
        `JSON parse error: ${cause instanceof Error ? cause.message : "unknown"}`,
      ],
    };
  }
  return validateOutput<T>(tool, parsed);
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

function formatErrors(errors: readonly ErrorObject[]): string[] {
  return errors.map((e) => {
    const path = e.instancePath.length > 0 ? e.instancePath : "(root)";
    return `${path}: ${e.message ?? "validation error"}`;
  });
}

export function outputSchemaSnippet(tool: TranslationTool): string {
  return JSON.stringify(buildOutputSchema(tool), null, 2);
}
