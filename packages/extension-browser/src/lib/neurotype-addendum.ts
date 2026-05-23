/**
 * Per-neurotype prompt addenda — see
 * `.claude-reports/2026-05-24-prompt-neurotype-tailoring/REPORT.md`.
 *
 * Pre-0.0.22 all prompts addressed "a neurodivergent reader" as one
 * undifferentiated audience. The riskiest free-text surfaces
 * (`recommended_next_action.reason`, `suggested_rewrite_hint`,
 * `tone_shift`, `my_asks[].text`, `description`) were unbounded by
 * prompt copy and only schema-capped, so a dyslexic user got the same
 * 3-paragraph wall as an ADHD user got the same 5-line "explicit_ask"
 * as an ASD user got idiom-laden "warm" rewrites.
 *
 * This module emits a block of reader-preference instructions that's
 * appended to the rendered prompt BEFORE the JSON-schema suffix. The
 * model reads the per-neurotype rules in time to shape its response.
 *
 * Combination rules (per the report):
 *   - `adhd` + `asd` → substitute the fused AuDHD block (NOT
 *     concatenate). AuDHD is first-class per `profile.schema.json`.
 *   - Profile listing `audhd` directly → use the AuDHD block.
 *   - Any other pair → concatenate in priority order; de-duplicate
 *     the {max_chunk_size} line is folded in by the model.
 *   - 3+ neurotypes → concatenate + conflict-resolution footer.
 *   - `other` always appended LAST so user-authored free-form notes
 *     are the final word the model reads.
 *
 * Schema-non-modification: all addenda fit inside existing v0.1.0
 * schema bounds. The instructions are prompt-level guidance the
 * model can honour without us widening any schema.
 */
import type { ExtensionProfile, Neurotype, OutputFormat } from "./types.js";

/**
 * Build the addendum string to insert between the rendered prompt
 * template and the JSON-schema suffix. Returns "" when the profile has
 * no neurotypes, no additional_notes, AND uses the default
 * output_format — i.e. the all-default case stays byte-identical to
 * the pre-0.0.22 prompt so existing test snapshots and behaviour are
 * preserved.
 */
export function buildNeurotypeAddendum(profile: ExtensionProfile): string {
  const effective = effectiveNeurotypes(profile.neurotypes);
  const hasNotes =
    profile.additionalNotes !== null && profile.additionalNotes.length > 0;
  const hasNonDefaultFormat = profile.outputFormat !== "answer_first";
  if (effective.length === 0 && !hasNotes && !hasNonDefaultFormat) {
    return "";
  }

  const sections: string[] = [];
  sections.push("---");
  sections.push("## Reader preferences");
  sections.push("");
  sections.push(renderOutputFormatBlock(profile.outputFormat));

  const ordered = orderByPriority(effective);
  for (const neurotype of ordered) {
    const block = renderNeurotypeBlock(
      neurotype,
      profile.maxChunkSize,
      profile.additionalNotes,
    );
    if (block.length > 0) {
      sections.push("");
      sections.push(block);
    }
  }

  // If the user has additional_notes but did NOT pick `other`, append
  // the notes as a free-form footer so they still reach the model.
  // When `other` IS in the neurotype list, renderNeurotypeBlock above
  // already emitted the notes inline.
  if (hasNotes && !ordered.includes("other")) {
    sections.push("");
    sections.push(renderOtherBlock(profile.additionalNotes ?? ""));
  }

  if (ordered.length >= 3) {
    sections.push("");
    sections.push(
      "When these preferences conflict (e.g. 'literal' vs 'soft'), " +
        "prefer the more conservative reading: shorter, more concrete, " +
        "less pressure.",
    );
  }

  sections.push("---");
  return `\n\n${sections.join("\n")}\n`;
}

/**
 * Apply the AuDHD substitution rule and de-duplicate. Returns the
 * neurotype list the addendum stack should iterate over.
 *
 * Examples:
 *   ["adhd", "asd"]            → ["audhd"]
 *   ["asd", "adhd", "ocd"]     → ["audhd", "ocd"]
 *   ["audhd", "adhd"]          → ["audhd"]      (no double-up)
 *   ["dyslexia", "dyspraxia"]  → ["dyslexia", "dyspraxia"]
 */
function effectiveNeurotypes(
  input: readonly Neurotype[],
): readonly Neurotype[] {
  const set = new Set<Neurotype>(input);
  if (set.has("audhd") || (set.has("adhd") && set.has("asd"))) {
    set.add("audhd");
    set.delete("adhd");
    set.delete("asd");
  }
  return Array.from(set);
}

/**
 * Priority ordering. Higher-priority addenda are placed LATER in the
 * prompt to exploit recency bias — most LLMs weight later instructions
 * more strongly. Tourette is no-op so it's first; `other` (user-
 * authored notes) is always last to take precedence.
 */
const PRIORITY: ReadonlyArray<Neurotype> = [
  "tourette",
  "dyspraxia",
  "dyslexia",
  "ocd",
  "asd",
  "adhd",
  "audhd",
  "other",
];

function orderByPriority(
  neurotypes: readonly Neurotype[],
): readonly Neurotype[] {
  return [...neurotypes].sort(
    (a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b),
  );
}

function renderOutputFormatBlock(format: OutputFormat): string {
  const descriptions: Record<OutputFormat, string> = {
    answer_first:
      "Lead every prose field with the headline conclusion. " +
      "Reasoning afterwards if at all.",
    conventional: "Brief context first, then the verdict.",
    bullet_first: "Lead with a short bullet list before any prose.",
  };
  return `Output shape: ${format} — ${descriptions[format]}`;
}

function renderNeurotypeBlock(
  neurotype: Neurotype,
  maxChunkSize: number,
  additionalNotes: string | null,
): string {
  switch (neurotype) {
    case "adhd":
      return [
        "Reader preferences (ADHD):",
        "- Lead with the verdict in the first phrase of any free-text field. No throat-clearing.",
        "- Keep prose fields to 1-2 short sentences. Cut qualifiers ('perhaps', 'it seems that', 'arguably').",
        `- Cap any list you return at ${maxChunkSize} items even if more would fit the schema. Rank by importance and stop.`,
        "- No nested clauses. One idea per sentence.",
        "- If you would say 'however' or 'that said', just start a new sentence.",
        "- Concrete verbs over abstract nouns. 'Send the spec' not 'completion of the spec distribution'.",
      ].join("\n");

    case "asd":
      return [
        "Reader preferences (autism):",
        "- State subtext literally. Do not soften with 'perhaps' or 'they might' if the evidence in the text is concrete enough to commit. Use 'the sender wants X' when the text supports it.",
        "- No idioms. Banned phrases include: 'touch base', 'circle back', 'loop in', 'ping you', 'moving forward', 'low-hanging fruit', 'ducks in a row', 'reach out', 'hop on a call', 'in the loop', 'out of pocket'.",
        "- If the input message contains an idiom, decode it literally in your prose ('ping you' -> 'send you a message').",
        "- If a sentence depends on tone of voice or facial expression that text cannot carry, flag that explicitly ('text alone is ambiguous — could be sincere or sarcastic').",
        "- Quote the source verbatim in parentheses when you paraphrase a decision or ask.",
        "- No metaphor. No analogies. No 'kind of' / 'sort of' hedges.",
      ].join("\n");

    case "audhd":
      return [
        "Reader preferences (AuDHD):",
        "- Lead with the verdict in the first phrase. Literal first sentence, no throat-clearing.",
        `- One idea per sentence; cap list fields at ${maxChunkSize} items.`,
        "- No idioms. Banned phrases include: 'touch base', 'circle back', 'loop in', 'ping', 'moving forward', 'low-hanging fruit', 'reach out', 'hop on a call'.",
        "- State subtext as commitments when the text supports it ('the sender wants X'), not as guesses ('they might want X') — but when the text is genuinely ambiguous, say so explicitly rather than picking one reading.",
        "- Concrete verbs over abstract nouns; quote the source verbatim in parentheses when paraphrasing a decision.",
        "- If a sentence depends on tone of voice the text cannot carry, flag that explicitly.",
      ].join("\n");

    case "ocd":
      return [
        "Reader preferences (OCD):",
        "- Low-pressure phrasing in any 'what to do' field. Avoid: 'urgent', 'must', 'immediately', 'right away', 'ASAP', 'critical', 'before it's too late', 'don't forget', 'make sure'.",
        "- Prefer: 'when you have a minute', 'no rush — when ready', 'consider', 'you may want to'.",
        "- Do not invent ambiguity or risk that is not in the source. If the message has no actionable issue, say so plainly ('nothing here needs an answer today').",
        "- When ranking items, prefer the lowest-pressure framing first.",
        "- Do not amplify time pressure. If the sender said 'soon', do not paraphrase as 'urgently'.",
        "- Never use the word 'wrong' about the user's draft. Use 'reads as' or 'may land as'.",
      ].join("\n");

    case "dyslexia":
      return [
        "Reader preferences (dyslexia):",
        "- Short sentences. Maximum 15 words per sentence. Break compound sentences into two.",
        "- Plain words. Replace 'paraphrased' with 'said plainly', 'ambiguous' with 'unclear', 'verbatim' with 'word-for-word', 'register' with 'tone', 'subtext' with 'what they really mean'.",
        "- One idea per sentence. No semicolons. No em-dashes inside sentences.",
        `- Cap any list at ${maxChunkSize} items.`,
        "- Free-text prose fields: 1 sentence where the schema permits 2-3.",
        "- Common words over rare ones. 'Use' not 'utilise'. 'Help' not 'facilitate'. 'About' not 'regarding'.",
      ].join("\n");

    case "dyspraxia":
      return [
        "Reader preferences (dyspraxia):",
        "- Minimise sequencing burden. Give absolute time markers ('Wednesday 28 May', 'by end of this week') rather than relative ones ('next sprint', 'soon').",
        "- For meeting briefs: if an ask references another ask or decision, name it explicitly rather than saying 'the above' or 'as mentioned earlier'.",
        "- For rewrites: prefer one continuous instruction over a numbered sequence when the action is single-step.",
        `- Cap any list at ${maxChunkSize} items.`,
        "- Group related items together; do not interleave asks from different topics.",
      ].join("\n");

    case "tourette":
      // Explicit no-op so prompt logs show Tourette was considered. The
      // motion-reduction relevant to Tourette is a UI concern handled
      // by `preferences.motion`, not a prompt concern.
      return "";

    case "other":
      // `other` carries the user's free-form notes. Render the block
      // only when notes are present — picking `other` alone without
      // writing anything emits no block, which is correct.
      if (additionalNotes === null || additionalNotes.length === 0) {
        return "";
      }
      return renderOtherBlock(additionalNotes);
  }
}

function renderOtherBlock(notes: string): string {
  return [
    "Reader preferences (self-described):",
    "- Treat the notes below as a literal instruction set from the reader. Honour any 'please do' / 'please don't' requests.",
    "",
    "Reader's own notes:",
    notes,
  ].join("\n");
}
