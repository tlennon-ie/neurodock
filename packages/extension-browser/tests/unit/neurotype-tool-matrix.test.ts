/**
 * neurotype-tool-matrix.test.ts
 *
 * Per-tool per-neurotype differentiation contract (0.0.25). For each
 * (tool, neurotype) pair where we ship a concrete block, the addendum
 * must:
 *
 *   1. Mention an actual schema field name unique to that tool (so the
 *      model can attach the rule to the right output slot), AND
 *   2. Include a substring specific to that neurotype's preferences (so
 *      a future refactor reverting to generic copy fails the test).
 *
 * Additionally, for `describe_image` (the surface the v0.0.25 bug
 * report flagged), three different neurotypes must produce textually
 * distinct addenda — proving the user-visible differentiation problem
 * is actually fixed at the addendum level.
 */
import { describe, it, expect } from "vitest";
import { buildNeurotypeAddendum } from "../../src/lib/neurotype-addendum.js";
import type {
  ExtensionProfile,
  Neurotype,
  TranslationTool,
} from "../../src/lib/types.js";

function profile(overrides: Partial<ExtensionProfile> = {}): ExtensionProfile {
  return {
    mode: "local",
    localProvider: "ollama",
    localEndpoint: "http://localhost:11434",
    localModel: "llama3.2:3b",
    localApiKey: null,
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    cloudApiKeys: {},
    historyEnabled: false,
    displayName: "you",
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
    ...overrides,
  };
}

/**
 * Per-tool field names every concrete block must reference for AT LEAST
 * ONE of the per-neurotype variants (the block doesn't need to mention
 * EVERY field — just at least one to attach the rule to the schema).
 */
const TOOL_FIELD_HINTS: Record<TranslationTool, readonly string[]> = {
  describe_image: [
    "description",
    "key_elements",
    "inferred_purpose",
    "transcribed_text",
    "accessibility_notes",
  ],
  translate_incoming: [
    "explicit_ask",
    "likely_subtext",
    "ambiguity",
    "recommended_next_action",
    "draft_reply",
  ],
  check_tone: [
    "flagged_phrases",
    "suggested_rewrite_hint",
    "axes",
    "baseline_delta",
  ],
  rewrite_outgoing: [
    "rewritten",
    "preserved_terms",
    "diff_summary",
    "tone_shift",
    "structural_changes",
  ],
  brief_meeting: ["my_asks", "others_asks", "decisions", "ambiguous_items"],
};

/**
 * Per-neurotype substrings. For each neurotype, the addendum (with the
 * relevant block selected) must contain at least one of these tokens.
 * This pins the contract — a future generic refactor would drop these.
 */
const NEUROTYPE_FINGERPRINTS: Record<
  Exclude<Neurotype, "tourette" | "other">,
  readonly string[]
> = {
  adhd: [
    "highest-priority",
    "highest-impact",
    "highest-confidence",
    "verb-led",
    "verb-first",
    "verb-phrase",
    "throat-clearing",
    "noun phrase",
    "4-7 words",
    "6 words or fewer",
    "8 words or fewer",
  ],
  asd: ["literal", "verbatim", "idiom", "no idioms", "tone"],
  audhd: ["literal", "verbatim", "AuDHD"],
  ocd: ["low-pressure", "urgent", "amplify", "must"],
  dyslexia: ["15 words", "plain", "Plain", "semicolons"],
  dyspraxia: [
    "absolute",
    "top-to-bottom",
    "Wednesday",
    "left-to-right",
    "top to bottom",
  ],
};

const TOOLS: readonly TranslationTool[] = [
  "describe_image",
  "translate_incoming",
  "check_tone",
  "rewrite_outgoing",
  "brief_meeting",
];

const CONCRETE_NEUROTYPES: ReadonlyArray<
  Exclude<Neurotype, "tourette" | "other">
> = ["adhd", "asd", "audhd", "ocd", "dyslexia", "dyspraxia"];

describe("neurotype-tool matrix — every concrete (tool, neurotype) pair", () => {
  for (const tool of TOOLS) {
    for (const neurotype of CONCRETE_NEUROTYPES) {
      it(`(${tool}, ${neurotype}) addendum references a schema field AND a neurotype fingerprint`, () => {
        const out = buildNeurotypeAddendum(
          profile({ neurotypes: [neurotype] }),
          tool,
        );
        // Sanity: addendum non-empty.
        expect(out.length).toBeGreaterThan(0);

        // At least one schema field name from this tool appears.
        const fields = TOOL_FIELD_HINTS[tool];
        const hasField = fields.some((f) => out.includes(f));
        expect(
          hasField,
          `expected (${tool}, ${neurotype}) addendum to mention one of: ${fields.join(
            ", ",
          )}\n--- got ---\n${out}`,
        ).toBe(true);

        // At least one neurotype-specific fingerprint appears.
        const fingerprints = NEUROTYPE_FINGERPRINTS[neurotype];
        const hasFingerprint = fingerprints.some((p) => out.includes(p));
        expect(
          hasFingerprint,
          `expected (${tool}, ${neurotype}) addendum to mention one of: ${fingerprints.join(
            ", ",
          )}\n--- got ---\n${out}`,
        ).toBe(true);
      });
    }
  }
});

describe("neurotype-tool matrix — same-tool, different-neurotype differentiation", () => {
  // For each tool, pick three neurotypes and assert all three addenda
  // are textually distinct. This catches the regression where the same
  // image produces near-identical outputs for ADHD vs dyslexia vs ASD.
  const SAMPLE_TRIOS: ReadonlyArray<{
    readonly tool: TranslationTool;
    readonly trio: ReadonlyArray<Exclude<Neurotype, "tourette" | "other">>;
  }> = [
    { tool: "describe_image", trio: ["adhd", "dyslexia", "asd"] },
    { tool: "translate_incoming", trio: ["adhd", "ocd", "dyslexia"] },
    { tool: "check_tone", trio: ["adhd", "asd", "dyspraxia"] },
    { tool: "rewrite_outgoing", trio: ["dyslexia", "ocd", "dyspraxia"] },
    { tool: "brief_meeting", trio: ["adhd", "asd", "dyslexia"] },
  ];

  for (const { tool, trio } of SAMPLE_TRIOS) {
    it(`(${tool}) three neurotypes ${trio.join(
      " / ",
    )} produce textually distinct addenda`, () => {
      const outs = trio.map((n) =>
        buildNeurotypeAddendum(profile({ neurotypes: [n] }), tool),
      );
      // Pairwise inequality.
      expect(outs[0]).not.toBe(outs[1]);
      expect(outs[1]).not.toBe(outs[2]);
      expect(outs[0]).not.toBe(outs[2]);
    });
  }

  it("describe_image + ADHD vs dyslexia vs ASD: each contains a fingerprint the others lack", () => {
    const adhd = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd"] }),
      "describe_image",
    );
    const dyslexia = buildNeurotypeAddendum(
      profile({ neurotypes: ["dyslexia"] }),
      "describe_image",
    );
    const asd = buildNeurotypeAddendum(
      profile({ neurotypes: ["asd"] }),
      "describe_image",
    );

    // ADHD-specific: the noun-phrase rule for inferred_purpose.
    expect(adhd).toContain("noun phrase, not a sentence");
    expect(dyslexia).not.toContain("noun phrase, not a sentence");
    expect(asd).not.toContain("noun phrase, not a sentence");

    // Dyslexia-specific: 15-word cap.
    expect(dyslexia).toContain("15 words");
    expect(adhd).not.toContain("15 words");

    // ASD-specific: build key_elements BEFORE description.
    expect(asd).toContain("BEFORE writing");
    expect(adhd).not.toContain("BEFORE writing");
    expect(dyslexia).not.toContain("BEFORE writing");
  });
});

describe("neurotype-tool matrix — tool overload falls back gracefully", () => {
  it("no tool argument => uses the generic block (back-compat)", () => {
    const withTool = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd"] }),
      "describe_image",
    );
    const withoutTool = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd"] }),
    );
    // With-tool addendum mentions key_elements; without-tool generic
    // block does not.
    expect(withTool).toContain("key_elements");
    expect(withoutTool).not.toContain("key_elements");
    // Both still self-identify as ADHD.
    expect(withTool).toContain("(ADHD)");
    expect(withoutTool).toContain("(ADHD)");
  });

  it("Tourette stays no-op even with a tool argument", () => {
    const out = buildNeurotypeAddendum(
      profile({ neurotypes: ["tourette"] }),
      "describe_image",
    );
    expect(out).not.toContain("(Tourette)");
    expect(out).not.toContain("(tourette)");
  });

  it("`other` notes still pass through inline with a tool argument", () => {
    const out = buildNeurotypeAddendum(
      profile({
        neurotypes: ["other"],
        additionalNotes: "Use kelvin not celsius.",
      }),
      "describe_image",
    );
    expect(out).toContain("self-described");
    expect(out).toContain("Use kelvin not celsius.");
  });

  it("AuDHD substitution rule still fires with a tool argument", () => {
    const out = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd", "asd"] }),
      "describe_image",
    );
    expect(out).toContain("(AuDHD)");
    expect(out).not.toContain("Reader preferences (ADHD) — describe_image:");
    expect(out).not.toContain("Reader preferences (autism) — describe_image:");
  });
});
