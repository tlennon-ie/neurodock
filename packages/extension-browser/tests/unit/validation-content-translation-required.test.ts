/**
 * validation-content-translation-required.test.ts
 *
 * Pins the 0.0.30 schema clarification: `content_translation` is
 * `["array", "null"]` with `minItems: 1` on the array branch. The
 * permissions matrix is:
 *
 *   content_translation: null           → ACCEPTED (decorative / chat-only)
 *   content_translation: [<entry>, ...] → ACCEPTED (instructional / actionable)
 *   content_translation: []             → REJECTED (the field exists but is useless)
 *   content_translation field omitted    → ACCEPTED (back-compat with v0.1.x)
 *
 * If a future schema change either drops `minItems: 1` (regressing the
 * empty-array escape hatch) or drops the `null` branch (breaking the
 * decorative-image case), this test fails.
 */
import { describe, it, expect } from "vitest";
import { validateOutput } from "../../src/lib/validation.js";
import type { ModelProvenance } from "../../src/lib/types.js";

const provenance: ModelProvenance = {
  mode: "local",
  provider: "ollama",
  model: "llama3.2-vision:11b",
};

function baseDescribeImage(): Record<string, unknown> {
  return {
    description: "A round avatar with a stylised brain motif.",
    contains_text: false,
    transcribed_text: null,
    key_elements: ["circle", "brain icon"],
    inferred_purpose: "GitHub user avatar.",
    accessibility_notes: null,
    eval_corpus_slice:
      "packages/evals/corpora/translation/image/v0.2.0/general.jsonl",
    model_provenance: provenance,
  };
}

function baseBriefMeeting(): Record<string, unknown> {
  return {
    my_asks: [],
    others_asks: [],
    decisions: [],
    ambiguous_items: [],
    eval_corpus_slice:
      "packages/evals/corpora/translation/meeting/v0.2.0/general.jsonl",
    model_provenance: provenance,
  };
}

describe("describe_image content_translation — null is permitted for decorative", () => {
  it("ACCEPTS content_translation: null (avatar / logo / decorative)", () => {
    const payload = {
      ...baseDescribeImage(),
      content_translation: null,
    };
    const result = validateOutput("describe_image", payload);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("ACCEPTS content_translation entirely omitted (legacy v0.1.x response)", () => {
    const payload = baseDescribeImage();
    const result = validateOutput("describe_image", payload);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("describe_image content_translation — non-empty arrays accepted", () => {
  it("ACCEPTS a populated content_translation (instructional image case)", () => {
    const payload = {
      ...baseDescribeImage(),
      content_translation: [
        {
          label: "Decouple Deployment from Release",
          facets: [
            {
              kind: "input",
              text: "You have code ready to deploy but not ready for users.",
            },
            {
              kind: "action",
              text: "Deploy behind a flag set to off for everyone.",
            },
            {
              kind: "goal",
              text: "Release becomes a config change, not a deploy.",
            },
          ],
        },
      ],
    };
    const result = validateOutput("describe_image", payload);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("describe_image content_translation — empty array REJECTED (0.0.30 tightening)", () => {
  it("REJECTS content_translation: [] (escape-hatch closed)", () => {
    const payload = {
      ...baseDescribeImage(),
      content_translation: [],
    };
    const result = validateOutput("describe_image", payload);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // The error should mention minItems / array bounds so an integrator
    // chasing the validation failure knows what was wrong.
    expect(result.errors.join(" | ")).toMatch(/minItems|fewer than|items/i);
  });
});

describe("brief_meeting content_translation — mirrors describe_image rules", () => {
  it("ACCEPTS content_translation: null (chat-only meeting)", () => {
    const payload = {
      ...baseBriefMeeting(),
      content_translation: null,
    };
    const result = validateOutput("brief_meeting", payload);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("ACCEPTS content_translation entirely omitted (legacy v0.1.x)", () => {
    const result = validateOutput("brief_meeting", baseBriefMeeting());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("ACCEPTS a populated content_translation", () => {
    const payload = {
      ...baseBriefMeeting(),
      content_translation: [
        {
          label: "my_asks[0]: migration script",
          facets: [
            {
              kind: "action",
              text: "Own the migration script.",
            },
            {
              kind: "goal",
              text: "Ship the script by Wednesday.",
            },
          ],
        },
      ],
    };
    const result = validateOutput("brief_meeting", payload);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("REJECTS content_translation: [] (escape-hatch closed)", () => {
    const payload = {
      ...baseBriefMeeting(),
      content_translation: [],
    };
    const result = validateOutput("brief_meeting", payload);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(" | ")).toMatch(/minItems|fewer than|items/i);
  });
});
