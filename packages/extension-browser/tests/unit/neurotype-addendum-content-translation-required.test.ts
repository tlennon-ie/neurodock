/**
 * neurotype-addendum-content-translation-required.test.ts
 *
 * 0.0.30 makes `content_translation` an INVARIANT on every concrete
 * (describe_image, NT) and (brief_meeting, NT) addendum. The 0.0.28
 * addenda nudged ("when the image has structured content, cap entries
 * at N"); 0.0.30 commands ("Always populate `content_translation` with
 * one entry per logical item ... Use null ONLY if ...").
 *
 * If a future refactor reverts to the conditional shape, this test fails.
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

const CONTENT_TRANSLATION_TOOLS: readonly TranslationTool[] = [
  "describe_image",
  "brief_meeting",
];

const CONCRETE_NEUROTYPES: ReadonlyArray<
  Exclude<Neurotype, "tourette" | "other">
> = ["adhd", "asd", "audhd", "ocd", "dyslexia", "dyspraxia"];

describe("content_translation invariant — every (describe_image/brief_meeting, NT) block commands", () => {
  for (const tool of CONTENT_TRANSLATION_TOOLS) {
    for (const neurotype of CONCRETE_NEUROTYPES) {
      it(`(${tool}, ${neurotype}) addendum starts the content_translation rule with "Always populate"`, () => {
        const out = buildNeurotypeAddendum(
          profile({ neurotypes: [neurotype] }),
          tool,
        );

        // INVARIANT phrasing — not conditional.
        expect(
          out,
          `expected (${tool}, ${neurotype}) to command (not nudge) content_translation. Got:\n${out}`,
        ).toContain("Always populate");

        // Must name the field by name so the model attaches the rule.
        expect(out).toContain("content_translation");

        // Must explicitly carve out the null case (decorative / chat-only)
        // so the model knows the one legitimate skip path.
        expect(
          out,
          `expected (${tool}, ${neurotype}) to name when null is permitted. Got:\n${out}`,
        ).toMatch(/Use null ONLY/);
      });
    }
  }
});

describe("content_translation invariant — appears EARLY in the per-NT block, not buried", () => {
  // The 0.0.28 problem was that the content_translation rule was the LAST
  // bullet in each block — small models anchored on the earlier rules and
  // ignored the trailing one. 0.0.30 puts the invariant first.
  for (const tool of CONTENT_TRANSLATION_TOOLS) {
    for (const neurotype of CONCRETE_NEUROTYPES) {
      it(`(${tool}, ${neurotype}) places the INVARIANT line before any metadata-field rule`, () => {
        const out = buildNeurotypeAddendum(
          profile({ neurotypes: [neurotype] }),
          tool,
        );

        const invariantIdx = out.indexOf("INVARIANT");
        expect(
          invariantIdx,
          `expected an INVARIANT marker in (${tool}, ${neurotype}) block. Got:\n${out}`,
        ).toBeGreaterThan(-1);

        // The invariant must appear before mid/tail-of-block fields like
        // 'description' or 'my_asks' — those are accessibility-tech
        // metadata. Pick a couple of metadata field names per tool.
        const metadataFields =
          tool === "describe_image"
            ? ["'description'", "'key_elements'"]
            : ["'my_asks'", "'others_asks'"];

        for (const field of metadataFields) {
          const fieldIdx = out.indexOf(field);
          if (fieldIdx >= 0) {
            expect(
              invariantIdx,
              `expected INVARIANT (idx ${invariantIdx}) to appear BEFORE ${field} (idx ${fieldIdx}) in (${tool}, ${neurotype}) block`,
            ).toBeLessThan(fieldIdx);
          }
        }
      });
    }
  }
});
