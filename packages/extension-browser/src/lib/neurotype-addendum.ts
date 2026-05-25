/**
 * Per-tool per-neurotype prompt addenda — see
 * `.claude-reports/2026-05-25-neurotype-differentiation/REPORT.md`.
 *
 * 0.0.22 first shipped per-neurotype addenda but the rules were
 * generic ("lead with the verdict in the first phrase"). The model
 * couldn't attach generic rules to schema fields, so for `describe_image`
 * with ADHD vs dyslexia vs ASD the same image produced three near-
 * identical outputs. Small models (gemma-4-e4b at 4B params) anchored
 * on the schema block which followed the addendum and ignored the
 * tail-end generic copy entirely.
 *
 * 0.0.25 rewrites this module:
 *
 *   1. Addendum builder dispatches on `(tool, neurotype)` to a small
 *      block of concrete, field-level rules that reference actual
 *      schema field names ('key_elements', 'inferred_purpose',
 *      'flagged_phrases', etc.). Generic rules survive as a fallback
 *      so the existing 3-neurotype conflict footer + max_chunk_size
 *      interpolation still works.
 *
 *   2. prompt-builder.ts moves the addendum to AFTER the schema block
 *      so the addendum is the LAST thing the model reads. The header
 *      makes the post-schema-override contract explicit so the model
 *      knows preferences can re-shape the JSON it's about to emit.
 *
 *   3. Each (tool, neurotype) pair fits in <= 25 lines per the
 *      manifesto's "concise + concrete > exhaustive" rule.
 *
 * Combination rules (unchanged from 0.0.22):
 *   - `adhd` + `asd` -> substitute the fused AuDHD block.
 *   - Profile listing `audhd` directly -> use the AuDHD block.
 *   - 3+ neurotypes -> concatenate + conflict-resolution footer.
 *   - `other` always last so user-authored notes are the final word.
 *
 * Schema-non-modification: all addenda fit inside existing v0.1.0
 * schema bounds. No schema widening; only prompt-level shaping.
 */
import type {
  ExtensionProfile,
  Neurotype,
  OutputFormat,
  TranslationTool,
} from "./types.js";

/**
 * Build the addendum string. When `tool` is provided, dispatch to the
 * per-tool per-neurotype blocks; otherwise fall back to the generic
 * 0.0.22 blocks (kept for back-compat with callers that haven't been
 * updated, and for the `additional_notes` / output_format-only case).
 *
 * Returns "" when the profile has no neurotypes, no additional_notes,
 * AND uses the default output_format — i.e. the all-default case stays
 * byte-identical to the pre-0.0.22 prompt so existing test snapshots
 * and behaviour are preserved.
 */
export function buildNeurotypeAddendum(
  profile: ExtensionProfile,
  tool?: TranslationTool,
): string {
  const effective = effectiveNeurotypes(profile.neurotypes);
  const hasNotes =
    profile.additionalNotes !== null && profile.additionalNotes.length > 0;
  const hasNonDefaultFormat = profile.outputFormat !== "answer_first";
  if (effective.length === 0 && !hasNotes && !hasNonDefaultFormat) {
    return "";
  }

  const sections: string[] = [];
  sections.push("---");
  sections.push("## Reader-specific overrides (apply LAST, after the schema)");
  sections.push("");
  sections.push(
    "The reader has these preferences. Honor them inside the schema-shaped " +
      "JSON you're about to write. If a preference conflicts with the schema, " +
      "the schema wins — but apply every preference that's compatible.",
  );
  sections.push("");
  sections.push(renderOutputFormatBlock(profile.outputFormat));

  const ordered = orderByPriority(effective);
  for (const neurotype of ordered) {
    const block = renderNeurotypeBlock(
      neurotype,
      profile.maxChunkSize,
      profile.additionalNotes,
      tool,
    );
    if (block.length > 0) {
      sections.push("");
      sections.push(block);
    }
  }

  // If the user has additional_notes but did NOT pick `other`, append
  // the notes as a free-form footer so they still reach the model.
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
  return "\n\n" + sections.join("\n") + "\n";
}

/**
 * Apply the AuDHD substitution rule and de-duplicate. Returns the
 * neurotype list the addendum stack should iterate over.
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
 * prompt to exploit recency bias. Tourette is no-op so it's first;
 * `other` (user-authored notes) is always last to take precedence.
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
  return "Output shape: " + format + " — " + descriptions[format];
}

function renderNeurotypeBlock(
  neurotype: Neurotype,
  maxChunkSize: number,
  additionalNotes: string | null,
  tool: TranslationTool | undefined,
): string {
  if (neurotype === "tourette") {
    // Explicit no-op so prompt logs show Tourette was considered. The
    // motion-reduction relevant to Tourette is a UI concern handled by
    // `preferences.motion`, not a prompt concern.
    return "";
  }

  if (neurotype === "other") {
    if (additionalNotes === null || additionalNotes.length === 0) {
      return "";
    }
    return renderOtherBlock(additionalNotes);
  }

  // Per-tool per-neurotype lookup. When the tool is known AND a concrete
  // block exists for the pair, use it. Otherwise fall through to the
  // generic block so older callers (and the no-tool overload) still get
  // the 0.0.22 behaviour.
  if (tool !== undefined) {
    const matrix = TOOL_BLOCKS[tool];
    const builder = matrix ? matrix[neurotype] : undefined;
    if (builder) {
      return builder(maxChunkSize);
    }
  }
  return renderGenericBlock(neurotype, maxChunkSize);
}

// ──────────────────────────────────────────────────────────────────────
// Per-tool per-neurotype concrete blocks.
//
// Each block:
//   - Names the actual schema fields the model will write.
//   - Caps at ~25 lines (manifesto: concise + concrete > exhaustive).
//   - Uses NeuroDock voice: direct, non-clinical, no "superpower",
//     no marketing intensifiers, no diagnosis-gated language.
//
// Style note: schema field names are quoted with single quotes ('name')
// rather than backticks to avoid colliding with TypeScript template
// literal syntax inside the block strings.
// ──────────────────────────────────────────────────────────────────────

type ConcreteNeurotype = Exclude<Neurotype, "tourette" | "other">;
type BlockBuilder = (maxChunkSize: number) => string;
type ToolMatrix = Partial<Record<ConcreteNeurotype, BlockBuilder>>;

const TOOL_BLOCKS: Record<TranslationTool, ToolMatrix> = {
  // ────────────────────────────────────────────────────────────────
  // describe_image
  // Fields: description, contains_text, transcribed_text,
  //   key_elements[], inferred_purpose, accessibility_notes.
  // ────────────────────────────────────────────────────────────────
  describe_image: {
    adhd: (max) =>
      [
        "Reader preferences (ADHD) — describe_image:",
        "- 'description': 1 sentence. Lead with the inferred purpose in 4-7 words, then what's visually shown.",
        "- 'key_elements': cap at " +
          max +
          ". Most prominent first. Stop ranking when you'd be reaching.",
        "- 'inferred_purpose': a noun phrase, not a sentence. 'Promotional slide' not 'This is a promotional slide that…'.",
        "- No qualifiers ('perhaps', 'appears to', 'seems'). Commit, or flag the uncertainty in 'accessibility_notes'.",
        "- 'accessibility_notes': 1 sentence max. Skip if there is nothing assistive-tech-relevant to add.",
        "- 'content_translation' (v0.2.0): when the image has structured content, cap entries at " +
          max +
          ". Each facet text is verb-led and 8 words or fewer ('Wait 5 seconds.', not 'It might be advisable to wait roughly five seconds').",
      ].join("\n"),

    asd: () =>
      [
        "Reader preferences (autism) — describe_image:",
        "- Build 'key_elements' (literal nouns + adjectives) BEFORE writing 'description'. The description then references those elements in visual-prominence order, without inferring meaning.",
        "- 'inferred_purpose': if text + visual evidence doesn't make purpose unambiguous, write 'I can't tell from the image alone' and explain in 'accessibility_notes' what would resolve it (e.g. the surrounding page text).",
        "- Banned soft hedges in 'description': 'kind of', 'sort of', 'looks like'. Use 'shows' or 'contains' instead.",
        "- 'transcribed_text': exact verbatim. If partially obscured, transcribe what's visible and mark the cut with '[…]'.",
        "- No metaphor anywhere. 'Speech-bubble shape' not 'a thought floating above her head'.",
        "- 'content_translation' (v0.2.0): each facet text is a literal commitment, no idioms. Quote the source label verbatim in the 'label' field (e.g. label = '1. Emotional Control (The \"Pause\" Strategy)' exactly as the image renders it). Decode any source idiom literally inside facets ('touch base' → 'send a follow-up message').",
      ].join("\n"),

    audhd: (max) =>
      [
        "Reader preferences (AuDHD) — describe_image:",
        "- 'description': 1 sentence. Lead with the literal subject in 4-7 words, then the inferred purpose.",
        "- 'key_elements': cap at " +
          max +
          ". Literal nouns + adjectives, visual-prominence order, no meaning-inference.",
        "- 'inferred_purpose': noun phrase, not sentence. When unambiguous, commit ('Promotional slide'). When not, write 'I can't tell from the image alone'.",
        "- Banned: 'perhaps', 'appears to', 'kind of', 'sort of', 'looks like'. Use 'shows' or 'contains'; flag genuine uncertainty in 'accessibility_notes'.",
        "- 'transcribed_text': exact verbatim. Mark obscured portions with '[…]'.",
        "- 'content_translation' (v0.2.0): cap entries at " +
          max +
          "; each facet is verb-led, literal, 8 words or fewer, no idioms. Quote source labels verbatim.",
      ].join("\n"),

    ocd: () =>
      [
        "Reader preferences (OCD) — describe_image:",
        "- In 'description' and 'inferred_purpose', don't say a slide is 'missing' something or 'incomplete' unless the image literally shows that. Slides are point-in-time snapshots; absence of an element is not a defect.",
        "- Avoid 'error', 'wrong', 'broken', 'mistake', 'should' in 'description'.",
        "- 'accessibility_notes': low-pressure framing. 'Consider adding alt-text describing X' not 'Alt-text is missing and must be added'.",
        "- If text is obscured in 'transcribed_text', describe what's visible without amplifying the concern.",
        "- 'content_translation' (v0.2.0): in 'action' and 'rule' facets, avoid 'must', 'urgent', 'critical', 'don't forget' unless the source uses those exact words. Prefer 'consider', 'you may want to', 'when ready'. Don't amplify pressure beyond the source.",
      ].join("\n"),

    dyslexia: (max) =>
      [
        "Reader preferences (dyslexia) — describe_image:",
        "- 'description': 1 sentence, max 15 words. Replace 'depicted' with 'shown', 'inferred' with 'guessed', 'transcribed' with 'copied'.",
        "- 'key_elements': simple nouns, cap at " +
          max +
          ". 'Logo' not 'Brand identity element'. 'Person' not 'Individual subject'.",
        "- 'inferred_purpose': 5 words or fewer. 'Promotional banner', 'Bar chart', 'UI screenshot'.",
        "- One idea per sentence everywhere. No semicolons. No em-dashes inside sentences.",
        "- 'accessibility_notes': plain words. 'Hard to read' not 'low legibility'.",
        "- 'content_translation' (v0.2.0): each facet text max 15 words, one idea per facet, common words ('use' not 'utilise'), no semicolons. Cap entries at " +
          max +
          ".",
      ].join("\n"),

    dyspraxia: (max) =>
      [
        "Reader preferences (dyspraxia) — describe_image:",
        "- For sequenced visuals (numbered steps, flowcharts, timelines), describe in the order they appear in the image. Don't reorder by importance.",
        "- 'key_elements': ordered top-to-bottom / left-to-right, not by prominence. Cap at " +
          max +
          ".",
        "- 'description': name spatial relationships explicitly ('logo top-left, headline centre, CTA button bottom-right') rather than 'the above'.",
        "- 'transcribed_text': preserve original order even if visually scattered; use line breaks between disjoint blocks.",
        "- 'content_translation' (v0.2.0): order entries top-to-bottom / left-to-right as they appear in the image, not by importance. Use absolute dates inside facets when the source uses any date ('Wednesday 28 May', not 'next week'). Never write 'as above' inside a facet — name the prior label.",
      ].join("\n"),
  },

  // ────────────────────────────────────────────────────────────────
  // translate_incoming
  // Fields: explicit_ask, likely_subtext[].{text,confidence},
  //   ambiguity.{detected,spans[]},
  //   recommended_next_action.{action,reason,draft_reply}.
  // ────────────────────────────────────────────────────────────────
  translate_incoming: {
    adhd: (max) =>
      [
        "Reader preferences (ADHD) — translate_incoming:",
        "- 'explicit_ask': 1 sentence, lead with the verb ('Send the spec by Friday' not 'The sender would like…').",
        "- 'likely_subtext': cap at " +
          max +
          " items, highest-confidence first.",
        "- 'recommended_next_action.action': imperative verb-phrase, 6 words or fewer. 'Reply with the spec link' not 'It might be worth replying'.",
        "- 'recommended_next_action.reason': 1 sentence. No throat-clearing.",
        "- 'recommended_next_action.draft_reply': if drafted, keep it to 1-2 short sentences.",
      ].join("\n"),

    asd: () =>
      [
        "Reader preferences (autism) — translate_incoming:",
        "- 'likely_subtext[].text': state subtext as commitments when evidence supports it ('The sender wants X by Friday'). Use guesses ('they might want X') ONLY when the message is genuinely ambiguous.",
        "- Decode any idiom in the source verbatim inside 'likely_subtext' (e.g. source 'circle back' -> subtext 'They will reply later'; source 'ping you' -> 'They will send a message').",
        "- 'ambiguity.spans[]': when a sentence depends on tone of voice or facial expression text cannot carry, mark it ambiguous with reason 'text alone cannot disambiguate tone'.",
        "- 'recommended_next_action.draft_reply': no idioms ('touch base', 'circle back', 'loop in', 'hop on a call', 'reach out'). Use literal verbs.",
        "- 'recommended_next_action.reason': quote the source verbatim in parentheses when paraphrasing the ask.",
      ].join("\n"),

    audhd: (max) =>
      [
        "Reader preferences (AuDHD) — translate_incoming:",
        "- 'explicit_ask': 1 sentence, lead with the verb. No throat-clearing.",
        "- 'likely_subtext': cap at " +
          max +
          "; state as commitments when text supports it, as guesses only when genuinely ambiguous.",
        "- Decode source idioms verbatim in 'likely_subtext' ('ping you' -> 'send you a message').",
        "- 'recommended_next_action.action': imperative verb-phrase, 6 words or fewer, no idioms.",
        "- 'recommended_next_action.draft_reply': 1-2 short sentences, literal verbs only.",
        "- 'ambiguity.spans[]': flag tone-dependent sentences with reason 'text alone cannot disambiguate tone'.",
      ].join("\n"),

    ocd: () =>
      [
        "Reader preferences (OCD) — translate_incoming:",
        "- 'recommended_next_action.action': low-pressure phrasing. Avoid 'urgent', 'must', 'immediately', 'ASAP', 'critical'. Prefer 'when you have a minute', 'consider', 'you may want to'.",
        "- 'recommended_next_action.reason': do not amplify time pressure. If the source said 'soon', don't paraphrase as 'urgently'.",
        "- 'ambiguity.detected': only flag ambiguity that's actually in the source. Don't invent ambiguity to be thorough.",
        "- 'likely_subtext': if the message has no actionable issue, return an empty array and say so plainly in 'recommended_next_action.reason' ('nothing here needs an answer today').",
        "- 'draft_reply': never say the reader's prior draft was 'wrong'. Use 'reads as' or 'may land as'.",
      ].join("\n"),

    dyslexia: (max) =>
      [
        "Reader preferences (dyslexia) — translate_incoming:",
        "- 'explicit_ask': max 15 words. Plain language. 'They want X' not 'The sender is requesting X'.",
        "- 'likely_subtext[].text': 1 sentence each, max 15 words. Cap list at " +
          max +
          ".",
        "- Replace 'paraphrased' with 'said plainly', 'ambiguous' with 'unclear', 'verbatim' with 'word-for-word', 'subtext' with 'what they really mean'.",
        "- 'recommended_next_action.reason': 1 short sentence. No semicolons. No em-dashes inside sentences.",
        "- 'recommended_next_action.draft_reply': short sentences. Common words ('use' not 'utilise', 'about' not 'regarding').",
      ].join("\n"),

    dyspraxia: (max) =>
      [
        "Reader preferences (dyspraxia) — translate_incoming:",
        "- Use absolute dates in 'explicit_ask' and 'draft_reply' ('Wednesday 28 May', 'by end of this week') not relative ones ('next sprint', 'soon').",
        "- 'likely_subtext': cap at " +
          max +
          "; if subtext references a prior thread message, name it explicitly rather than 'the above'.",
        "- 'recommended_next_action.action': single-step where possible. If multi-step, number the steps inside 'draft_reply', not inside 'action'.",
        "- Group related subtext items together — don't interleave 'they want X' with 'they're worried about Y'.",
      ].join("\n"),
  },

  // ────────────────────────────────────────────────────────────────
  // check_tone
  // Fields: axes.{directness,warmth,urgency}, baseline_delta,
  //   flagged_phrases[].{quote,reason,suggestion},
  //   suggested_rewrite_hint.
  // ────────────────────────────────────────────────────────────────
  check_tone: {
    adhd: (max) =>
      [
        "Reader preferences (ADHD) — check_tone:",
        "- 'flagged_phrases': cap at " +
          max +
          ", highest-impact first. Don't pad the list.",
        "- 'flagged_phrases[].reason': 1 short sentence per entry.",
        "- 'flagged_phrases[].suggestion': a concrete replacement, not advice. 'Replace with: \"by Friday\"' not 'Consider being more specific'.",
        "- 'suggested_rewrite_hint': 1-2 sentences, verb-led. 'Tighten the opener, drop the hedges' not 'You might want to consider tightening…'.",
      ].join("\n"),

    asd: () =>
      [
        "Reader preferences (autism) — check_tone:",
        "- 'axes': state the score literally — don't soften with 'somewhat' or 'a bit'. 0.2 means 'low'; say so.",
        "- 'baseline_delta': when prior messages aren't available, return null rather than guessing a baseline.",
        "- 'flagged_phrases[].reason': explain WHY the phrase reads as it does ('reads as terse because it has no greeting and uses imperative mood'), not just 'sounds blunt'.",
        "- 'suggested_rewrite_hint': literal, no idioms ('touch base', 'soften the ask', 'warm up'). Use concrete edits ('add a greeting; replace \"send it\" with \"could you send it\"').",
        "- 'flagged_phrases[].suggestion': exact replacement string, not a description of the change.",
      ].join("\n"),

    audhd: (max) =>
      [
        "Reader preferences (AuDHD) — check_tone:",
        "- 'flagged_phrases': cap at " +
          max +
          ", highest-impact first. Each 'suggestion' is a concrete replacement string, not advice.",
        "- 'flagged_phrases[].reason': 1 sentence; name the mechanism ('imperative mood, no greeting') not just the impression ('blunt').",
        "- 'suggested_rewrite_hint': verb-led, literal, no idioms. 'Add a greeting; soften the ask by changing \"send it\" to \"could you send it\".'",
        "- 'axes': state scores literally — don't hedge with 'somewhat'.",
        "- 'baseline_delta': null when no prior baseline; don't guess.",
      ].join("\n"),

    ocd: () =>
      [
        "Reader preferences (OCD) — check_tone:",
        "- 'flagged_phrases[].reason': avoid 'wrong', 'mistake', 'error'. Use 'reads as' or 'may land as'.",
        "- 'suggested_rewrite_hint': low-pressure framing. 'You may want to add a greeting' not 'You must add a greeting'.",
        "- Do not flag a phrase as a problem if the only issue is that it could theoretically be misread. Flag actual tone issues, not hypothetical ones.",
        "- 'axes.urgency': if the source genuinely is urgent (deadline in source text), don't downgrade the score to seem 'calmer'. Report the tone the message actually has.",
      ].join("\n"),

    dyslexia: (max) =>
      [
        "Reader preferences (dyslexia) — check_tone:",
        "- 'flagged_phrases': cap at " + max + ". Each 'reason' max 15 words.",
        "- 'suggested_rewrite_hint': 1-2 short sentences. Plain words ('softer' not 'less assertive', 'shorter' not 'more concise').",
        "- One idea per sentence in every prose field. No semicolons.",
        "- 'flagged_phrases[].suggestion': a concrete replacement string, short.",
      ].join("\n"),

    dyspraxia: (max) =>
      [
        "Reader preferences (dyspraxia) — check_tone:",
        "- 'flagged_phrases': " +
          max +
          " max, ordered as they appear in the source text (top to bottom) — not by severity.",
        "- 'suggested_rewrite_hint': if multi-step, write as a single continuous instruction rather than a numbered sequence.",
        "- Don't reference 'the above' or 'as mentioned'; name the specific phrase ('the opener \"hey\"', not 'the first issue').",
      ].join("\n"),
  },

  // ────────────────────────────────────────────────────────────────
  // rewrite_outgoing
  // Fields: rewritten, preserved_terms[],
  //   diff_summary.{tone_shift, structural_changes[], warnings[]}.
  // ────────────────────────────────────────────────────────────────
  rewrite_outgoing: {
    adhd: (max) =>
      [
        "Reader preferences (ADHD) — rewrite_outgoing:",
        "- 'rewritten': keep length within ~20% of the source. Don't pad to sound 'professional'.",
        "- 'diff_summary.structural_changes': cap at " +
          max +
          ", highest-impact first.",
        "- 'diff_summary.tone_shift': 1 short sentence describing the shift verb-first ('Softened the ask; kept the deadline').",
        "- 'diff_summary.warnings': only include warnings the reader actually needs to act on. Skip 'minor style changes'.",
      ].join("\n"),

    asd: () =>
      [
        "Reader preferences (autism) — rewrite_outgoing:",
        "- 'rewritten': preserve the literal ask. If the source says 'send the report by Friday', the rewrite still says that explicitly — don't bury it under softening.",
        "- 'rewritten': no idioms introduced. Banned in the rewrite: 'touch base', 'circle back', 'loop in', 'hop on', 'reach out', 'moving forward', 'low-hanging fruit'.",
        "- 'preserved_terms': include any technical term, name, or quoted phrase from the source that has a precise meaning.",
        "- 'diff_summary.tone_shift': name the mechanism ('added a greeting; replaced imperative with question form'), not the impression ('made it warmer').",
        "- 'diff_summary.warnings': flag if softening could obscure the deadline or quantity in the source.",
      ].join("\n"),

    audhd: (max) =>
      [
        "Reader preferences (AuDHD) — rewrite_outgoing:",
        "- 'rewritten': keep within ~20% of source length; preserve the literal ask verbatim; no introduced idioms.",
        "- 'diff_summary.structural_changes': cap at " +
          max +
          "; name mechanisms not impressions.",
        "- 'diff_summary.tone_shift': 1 sentence, verb-led. 'Added greeting, replaced imperative with question form.'",
        "- 'preserved_terms': include technical terms, names, and quoted source phrases.",
        "- 'diff_summary.warnings': flag if softening would obscure the deadline or quantity.",
      ].join("\n"),

    ocd: () =>
      [
        "Reader preferences (OCD) — rewrite_outgoing:",
        "- 'rewritten': avoid 'urgent', 'must', 'ASAP', 'critical', 'don't forget' unless the source uses them. Don't amplify pressure beyond the source.",
        "- 'diff_summary.warnings': don't warn that the source was 'wrong' or 'aggressive'. Use 'the original could land as terse' instead.",
        "- 'diff_summary.tone_shift': avoid 'fixed', 'corrected', 'cleaned up'. Use 'shifted toward' or 'reduced'.",
        "- Don't add hedging the source didn't have unless the target_register asks for it.",
      ].join("\n"),

    dyslexia: (max) =>
      [
        "Reader preferences (dyslexia) — rewrite_outgoing:",
        "- 'rewritten': short sentences, max 15 words each. Common words ('use' not 'utilise', 'help' not 'facilitate').",
        "- 'diff_summary.structural_changes': cap at " +
          max +
          "; each item 1 short phrase, not a sentence.",
        "- 'diff_summary.tone_shift': 1 short sentence. Plain words.",
        "- Break compound sentences into two during the rewrite. No semicolons in 'rewritten'.",
      ].join("\n"),

    dyspraxia: (max) =>
      [
        "Reader preferences (dyspraxia) — rewrite_outgoing:",
        "- 'rewritten': use absolute dates ('Wednesday 28 May'), not relative ones ('next week'), even if the source used relative.",
        "- 'diff_summary.structural_changes': " +
          max +
          " max, ordered by where they appear in the rewrite (top to bottom).",
        "- If the source asks for a sequence of actions, keep the sequence in source order in the rewrite; don't reorder for 'flow'.",
        "- 'diff_summary.warnings': flag if the rewrite introduces a forward-reference ('as mentioned above') that the source didn't have.",
      ].join("\n"),
  },

  // ────────────────────────────────────────────────────────────────
  // brief_meeting
  // Fields: my_asks[], others_asks[], decisions[], ambiguous_items[].
  // ────────────────────────────────────────────────────────────────
  brief_meeting: {
    adhd: (max) =>
      [
        "Reader preferences (ADHD) — brief_meeting:",
        "- 'my_asks': cap at " +
          max +
          ", highest-priority first. Each ask is verb-led ('Send the spec to Bob') in 8 words or fewer.",
        "- 'others_asks': same cap and shape.",
        "- 'decisions[]': 1 short sentence each. State the decision, not the discussion.",
        "- 'ambiguous_items[]': include ONLY items the reader needs to chase. Skip 'minor topics raised'.",
        "- 'content_translation' (v0.2.0): cap entries at " +
          max +
          "; each facet verb-led and 8 words or fewer. Label each entry as 'my_asks[i]' / 'decisions[i]' so the reader can jump back to the verbatim quote.",
      ].join("\n"),

    asd: () =>
      [
        "Reader preferences (autism) — brief_meeting:",
        "- 'my_asks[].text' and 'others_asks[].text': quote the original speaker verbatim in parentheses when paraphrasing ('Send the spec (\"can you ping me the spec by Fri?\")').",
        "- 'decisions[]': state the decision and the speaker who made it. Don't infer consensus that wasn't stated.",
        "- 'ambiguous_items[]': flag any item where the transcript depends on tone or shared context not in the text. Reason 'verbal agreement implied but not stated' is a legitimate ambiguity.",
        "- No idioms in any text field ('touch base', 'circle back', 'loop in').",
        "- 'content_translation' (v0.2.0): each facet is a literal commitment. Decode source idioms inside facets ('circle back' → 'reply later'). Quote the source 'asker' speaker in the 'label' field.",
      ].join("\n"),

    audhd: (max) =>
      [
        "Reader preferences (AuDHD) — brief_meeting:",
        "- 'my_asks' / 'others_asks': cap at " +
          max +
          ", verb-led, 8 words or fewer. Quote source verbatim in parentheses when paraphrasing.",
        "- 'decisions[]': 1 sentence each, name the speaker; don't infer unstated consensus.",
        "- 'ambiguous_items[]': flag tone-dependent items with reason 'verbal agreement implied but not stated'. Skip 'minor topics raised'.",
        "- No idioms anywhere.",
        "- 'content_translation' (v0.2.0): cap at " +
          max +
          "; verb-led, literal, 8 words or fewer, no idioms. Label each entry as 'my_asks[i]' / 'decisions[i]'.",
      ].join("\n"),

    ocd: () =>
      [
        "Reader preferences (OCD) — brief_meeting:",
        "- 'my_asks[]': don't add asks that weren't actually assigned to the reader. If the transcript is ambiguous about who owns an action, put it in 'ambiguous_items[]' instead.",
        "- 'ambiguous_items[]': distinguish 'unclear who owns this' from 'this needs follow-up'. Reason field should name which kind of ambiguity.",
        "- No 'must', 'urgent', 'critical' in 'my_asks[].text' unless the speaker used those words.",
        "- 'decisions[]': don't flag a decision as 'final' unless the transcript explicitly closes it.",
        "- 'content_translation' (v0.2.0): in 'action' facets, avoid 'must', 'urgent', 'ASAP', 'critical' unless the source used them. Prefer 'when you have a minute'. Don't amplify pressure beyond the transcript.",
      ].join("\n"),

    dyslexia: (max) =>
      [
        "Reader preferences (dyslexia) — brief_meeting:",
        "- All list fields: cap at " + max + ", each item max 15 words.",
        "- Plain language. 'Bob will send the spec' not 'Bob will action distribution of the specification'.",
        "- 'decisions[]': one decision per item. Don't combine two decisions into one sentence with 'and'.",
        "- 'ambiguous_items[].reason': 1 short sentence; no semicolons.",
        "- 'content_translation' (v0.2.0): each facet text max 15 words, one idea per facet, common words, no semicolons. Cap entries at " +
          max +
          ".",
      ].join("\n"),

    dyspraxia: (max) =>
      [
        "Reader preferences (dyspraxia) — brief_meeting:",
        "- 'my_asks' / 'others_asks': ordered by when they appear in the transcript, not by priority. Cap at " +
          max +
          ".",
        "- Use absolute dates in 'text' fields when the transcript implies a deadline ('Wednesday 28 May' rather than 'next week').",
        "- 'decisions[]': name the topic explicitly each time. Don't write 'as discussed above' or 'the prior point'.",
        "- Group related items together — don't interleave asks from different topics.",
        "- 'content_translation' (v0.2.0): order entries by transcript appearance, not priority. Absolute dates inside facets. Never 'as above' — name the prior label.",
      ].join("\n"),
  },
};

// ──────────────────────────────────────────────────────────────────────
// Generic fallback blocks (0.0.22 wording, retained for back-compat
// with callers that don't pass `tool` and for any (tool, neurotype)
// pair we haven't yet covered concretely).
// ──────────────────────────────────────────────────────────────────────

function renderGenericBlock(
  neurotype: ConcreteNeurotype,
  maxChunkSize: number,
): string {
  switch (neurotype) {
    case "adhd":
      return [
        "Reader preferences (ADHD):",
        "- Lead with the verdict in the first phrase of any free-text field. No throat-clearing.",
        "- Keep prose fields to 1-2 short sentences. Cut qualifiers ('perhaps', 'it seems that', 'arguably').",
        "- Cap any list you return at " +
          maxChunkSize +
          " items even if more would fit the schema. Rank by importance and stop.",
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
        "- One idea per sentence; cap list fields at " +
          maxChunkSize +
          " items.",
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
        "- Cap any list at " + maxChunkSize + " items.",
        "- Free-text prose fields: 1 sentence where the schema permits 2-3.",
        "- Common words over rare ones. 'Use' not 'utilise'. 'Help' not 'facilitate'. 'About' not 'regarding'.",
      ].join("\n");

    case "dyspraxia":
      return [
        "Reader preferences (dyspraxia):",
        "- Minimise sequencing burden. Give absolute time markers ('Wednesday 28 May', 'by end of this week') rather than relative ones ('next sprint', 'soon').",
        "- For meeting briefs: if an ask references another ask or decision, name it explicitly rather than saying 'the above' or 'as mentioned earlier'.",
        "- For rewrites: prefer one continuous instruction over a numbered sequence when the action is single-step.",
        "- Cap any list at " + maxChunkSize + " items.",
        "- Group related items together; do not interleave asks from different topics.",
      ].join("\n");
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
