/**
 * prompt-builder.ts
 *
 * Assemble the prompt for a given tool from:
 *   1. The synced prompt template (mirrored from packages/mcp-translation).
 *   2. The caller's input (channel, text, thread_context, …).
 *   3. The output JSON schema appended in-band — improves first-try
 *      schema conformance and reduces validation retries.
 *
 * Per ADR 0005 we never modify the prompt templates in place; we render
 * placeholders ({foo}) into them and append the schema. Note that
 * double-brace placeholders ({{foo}}) in the prompt are literal — the
 * Python side uses them as Markdown-safe braces, so we MUST NOT collapse
 * them.
 */
import translateIncomingPrompt from "./prompts/translate_incoming.prompt.md?raw";
import checkTonePrompt from "./prompts/check_tone.prompt.md?raw";
import rewriteOutgoingPrompt from "./prompts/rewrite_outgoing.prompt.md?raw";
import briefMeetingPrompt from "./prompts/brief_meeting.prompt.md?raw";
import describeImagePrompt from "./prompts/describe_image.prompt.md?raw";
import { outputSchemaSnippet } from "./validation.js";
import type { TranslationTool } from "./types.js";

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
}

export function buildPrompt({ tool, input }: PromptInputs): string {
  const template = TEMPLATES[tool];
  const rendered = renderTemplate(template, input);
  const schema = outputSchemaSnippet(tool);
  return `${rendered}${SUFFIX_HEADER}\`\`\`json\n${schema}\n\`\`\`\n`;
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
