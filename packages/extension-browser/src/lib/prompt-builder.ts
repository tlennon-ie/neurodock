/**
 * prompt-builder.ts
 *
 * Assemble the prompt for a given tool from:
 *   1. The synced prompt template (mirrored from packages/mcp-translation).
 *   2. The caller's input (channel, text, thread_context, …).
 *   3. The output JSON schema appended in-band — improves first-try
 *      schema conformance and reduces validation retries.
 *   4. (0.0.25) The reader-preference / per-neurotype addendum,
 *      appended AFTER the schema. Schema is concrete and small models
 *      anchor on it; placing the addendum last means the model reads
 *      the per-field overrides as the most recent instruction before
 *      emitting JSON.
 *
 * Per ADR 0005 we never modify the prompt templates in place; we render
 * placeholders ({foo}) into them and append the schema. Double-brace
 * placeholders ({{foo}}) in the prompt are literal — the Python side
 * uses them as Markdown-safe braces, so we MUST NOT collapse them.
 */
import translateIncomingPrompt from "./prompts/translate_incoming.prompt.md?raw";
import checkTonePrompt from "./prompts/check_tone.prompt.md?raw";
import rewriteOutgoingPrompt from "./prompts/rewrite_outgoing.prompt.md?raw";
import briefMeetingPrompt from "./prompts/brief_meeting.prompt.md?raw";
import describeImagePrompt from "./prompts/describe_image.prompt.md?raw";
import { outputSchemaSnippet } from "./validation.js";
import { buildNeurotypeAddendum } from "./neurotype-addendum.js";
import type { ExtensionProfile, TranslationTool } from "./types.js";

const TEMPLATES: Record<TranslationTool, string> = {
  translate_incoming: translateIncomingPrompt,
  check_tone: checkTonePrompt,
  rewrite_outgoing: rewriteOutgoingPrompt,
  brief_meeting: briefMeetingPrompt,
  describe_image: describeImagePrompt,
};

const SUFFIX_HEADER =
  "\n\n---\n## Output JSON Schema (draft-2020-12)\n\n" +
  "Your response MUST be a single JSON object validating against this " +
  "schema. Do not include prose, markdown, or commentary outside the " +
  "JSON. Do not wrap the object in code fences.\n\n";

export interface PromptInputs {
  readonly tool: TranslationTool;
  readonly input: Record<string, unknown>;
  /**
   * 0.0.22: optional profile context so the prompt-builder can append
   * the per-neurotype addendum block. Omit to get the byte-identical
   * pre-0.0.22 prompt (the addendum builder returns "" for the
   * all-default profile case).
   */
  readonly profile?: ExtensionProfile;
}

export function buildPrompt({ tool, input, profile }: PromptInputs): string {
  const template = TEMPLATES[tool];
  const rendered = renderTemplate(template, input);
  const schema = outputSchemaSnippet(tool);
  // 0.0.25: addendum is now appended AFTER the schema block. Small
  // models (4B-class local) anchor on whichever instruction is most
  // recent + most concrete. The schema is concrete and structural;
  // placing the per-tool per-neurotype overrides AFTER it makes the
  // overrides the final instruction the model reads. The header in
  // buildNeurotypeAddendum makes the post-schema-override contract
  // explicit so the model knows preferences can re-shape the JSON.
  const addendum = profile ? buildNeurotypeAddendum(profile, tool) : "";
  return rendered + SUFFIX_HEADER + "```json\n" + schema + "\n```\n" + addendum;
}

function renderTemplate(
  template: string,
  input: Record<string, unknown>,
): string {
  return template.replace(
    /(?<!\{)\{([a-z_][a-z0-9_]*)\}(?!\})/g,
    (_match, key: string) => stringify(input[key]),
  );
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "(not provided)";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "(none)";
    return value.map((v, idx) => `- [${idx}] ${stringify(v)}`).join("\n");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
