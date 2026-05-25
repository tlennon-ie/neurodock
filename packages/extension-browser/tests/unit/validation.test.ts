import { describe, it, expect, beforeEach } from "vitest";
import {
  parseAndValidate,
  validateOutput,
  extractJson,
  normaliseLLMOutput,
  _resetValidatorsForTests,
} from "../../src/lib/validation.js";
import type { ModelProvenance } from "../../src/lib/types.js";

beforeEach(() => {
  _resetValidatorsForTests();
});

describe("validation", () => {
  it("accepts a well-formed translate_incoming output", () => {
    const payload = {
      explicit_ask: "Reopen the discussion.",
      likely_subtext: [{ text: "Wants delay.", confidence: 0.7 }],
      ambiguity: { detected: false, spans: [] },
      recommended_next_action: {
        action: "clarify",
        reason: "Ask for specifics.",
        draft_reply: null,
      },
      eval_corpus_slice:
        "packages/evals/corpora/translation/incoming/v0.1.0/general.jsonl",
      model_provenance: {
        mode: "local",
        provider: "ollama",
        model: "llama3.2:3b",
      },
    };
    const res = validateOutput("translate_incoming", payload);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("rejects payloads missing required keys", () => {
    const res = validateOutput("translate_incoming", { explicit_ask: null });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("extracts JSON from a fenced markdown block", () => {
    const raw = 'Here is the output:\n```json\n{"ok":true}\n```\n\nThanks!';
    expect(extractJson(raw)).toBe('{"ok":true}');
  });

  it("extracts JSON from raw prose with trailing braces", () => {
    expect(extractJson('Sure! {"a":1}')).toBe('{"a":1}');
  });

  it("reports parse error on broken JSON", () => {
    const res = parseAndValidate("translate_incoming", "{not-json");
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/JSON parse error|Could not locate/);
  });
});

describe("normaliseLLMOutput", () => {
  const provenance: ModelProvenance = {
    mode: "local",
    provider: "lmstudio",
    model: "gemma-4-e4b",
  };

  it("injects model_provenance + eval_corpus_slice when the LLM omits them", () => {
    const rawFromLLM = {
      description: "A round avatar with a stylised brain motif.",
      contains_text: false,
      key_elements: ["circle", "brain icon"],
      inferred_purpose: "GitHub user avatar.",
    };
    const out = normaliseLLMOutput("describe_image", rawFromLLM, provenance);
    const validated = validateOutput("describe_image", out);
    expect(validated.errors).toEqual([]);
    expect(validated.ok).toBe(true);
  });

  it("coerces contains_text string-booleans to real booleans", () => {
    const rawFromLLM = {
      description: "Screenshot of a settings page.",
      contains_text: "true",
      key_elements: ["toggle", "save button"],
      inferred_purpose: "Documentation screenshot.",
    };
    const out = normaliseLLMOutput("describe_image", rawFromLLM, provenance);
    const validated = validateOutput("describe_image", out);
    expect(validated.ok).toBe(true);
  });

  it("preserves the model's eval_corpus_slice + model_provenance when present", () => {
    const rawFromLLM = {
      description: "Bar chart with five bars descending right-to-left.",
      contains_text: true,
      key_elements: ["bars", "axis labels"],
      inferred_purpose: "Sales-by-quarter visualisation.",
      eval_corpus_slice: "custom-eval-slice",
      model_provenance: {
        mode: "local",
        provider: "lmstudio",
        model: "qwen2-vl-7b",
      },
    } as const;
    const out = normaliseLLMOutput(
      "describe_image",
      rawFromLLM,
      provenance,
    ) as Record<string, unknown>;
    expect(out.eval_corpus_slice).toBe("custom-eval-slice");
    expect((out.model_provenance as ModelProvenance).model).toBe("qwen2-vl-7b");
  });

  it("does not invent fields that genuinely need to come from the model", () => {
    // Missing `description` is a real validation failure — normalisation
    // shouldn't paper over it.
    const rawFromLLM = {
      contains_text: false,
      key_elements: [],
      inferred_purpose: "Decorative.",
    };
    const out = normaliseLLMOutput("describe_image", rawFromLLM, provenance);
    const validated = validateOutput("describe_image", out);
    expect(validated.ok).toBe(false);
    expect(validated.errors.join(" ")).toMatch(/description/);
  });

  it("parseAndValidate uses normalisation when provenance is supplied", () => {
    const raw = JSON.stringify({
      description: "A red circle on a beige background.",
      contains_text: "false",
      key_elements: ["red circle"],
      inferred_purpose: "Logo.",
    });
    const res = parseAndValidate("describe_image", raw, provenance);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("parseAndValidate without provenance still validates strictly (back-compat)", () => {
    const raw = JSON.stringify({
      description: "A red circle on a beige background.",
      contains_text: false,
      key_elements: ["red circle"],
      inferred_purpose: "Logo.",
    });
    const res = parseAndValidate("describe_image", raw);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/eval_corpus_slice|model_provenance/);
  });

  it("describe_image WITHOUT content_translation still validates (v0.2.0 back-compat)", () => {
    // REGRESSION: v0.2.0 added an optional `content_translation` field.
    // Pre-0.2.0 responses (omitting the field) MUST still validate.
    const legacyShape = {
      description: "A round avatar with a stylised brain motif.",
      contains_text: false,
      key_elements: ["circle", "brain icon"],
      inferred_purpose: "GitHub user avatar.",
      eval_corpus_slice: "describe_image-v0.1.0",
      model_provenance: {
        mode: "local" as const,
        provider: "lmstudio",
        model: "gemma-4-e4b",
      },
    };
    const res = validateOutput("describe_image", legacyShape);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("describe_image WITH content_translation validates (v0.2.0 new shape)", () => {
    const newShape = {
      description:
        "An octagonal infographic about emotional intelligence with eight numbered panels.",
      contains_text: true,
      transcribed_text:
        "8 Ways to Display Emotional Intelligence\n1. Emotional Control\n2. Logical Trust\n3. Clarity",
      key_elements: ["octagonal diagram", "lightbulb icon", "eight panels"],
      inferred_purpose: "Educational infographic.",
      accessibility_notes:
        "Infographic listing eight emotional-intelligence techniques.",
      content_translation: [
        {
          label: "1. Emotional Control (The 'Pause' Strategy)",
          facets: [
            { kind: "input", text: "You feel an emotion." },
            {
              kind: "action",
              text: "Stop moving, stop talking. Wait 5 seconds.",
            },
            {
              kind: "goal",
              text: "Treat the emotion as data, not a command.",
            },
          ],
        },
        {
          label: "2. Logical Trust (The 'First-Pass' Protocol)",
          facets: [
            {
              kind: "rule",
              text: "Assume the other person is trying to help until proven otherwise.",
            },
            { kind: "action", text: "Grant trust immediately." },
            { kind: "benefit", text: "Reduces vigilance overhead." },
          ],
        },
      ],
      eval_corpus_slice: "describe_image-v0.2.0",
      model_provenance: {
        mode: "local" as const,
        provider: "lmstudio",
        model: "qwen2-vl-7b",
      },
    };
    const res = validateOutput("describe_image", newShape);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("describe_image with content_translation=null validates (decorative-image case)", () => {
    const decorative = {
      description: "A logo with a stylised mountain silhouette.",
      contains_text: false,
      key_elements: ["mountain silhouette", "circular border"],
      inferred_purpose: "Company logo.",
      content_translation: null,
      eval_corpus_slice: "describe_image-v0.2.0",
      model_provenance: {
        mode: "local" as const,
        provider: "ollama",
        model: "llava",
      },
    };
    const res = validateOutput("describe_image", decorative);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("describe_image rejects content_translation with an unknown facet kind", () => {
    const bogus = {
      description: "A diagram.",
      contains_text: false,
      key_elements: [],
      inferred_purpose: "Diagram.",
      content_translation: [
        {
          label: "1. Step One",
          facets: [{ kind: "wishful_thinking", text: "x" }],
        },
      ],
      eval_corpus_slice: "describe_image-v0.2.0",
      model_provenance: {
        mode: "local" as const,
        provider: "ollama",
        model: "llava",
      },
    };
    const res = validateOutput("describe_image", bogus);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/kind|enum/);
  });

  it("brief_meeting WITHOUT content_translation still validates (v0.2.0 back-compat)", () => {
    const legacyBrief = {
      my_asks: [],
      others_asks: [],
      decisions: [],
      ambiguous_items: [],
      eval_corpus_slice: "brief_meeting-v0.1.0",
      model_provenance: {
        mode: "local" as const,
        provider: "ollama",
        model: "llama3.1:8b-instruct",
      },
    };
    const res = validateOutput("brief_meeting", legacyBrief);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("brief_meeting WITH content_translation validates (v0.2.0 new shape)", () => {
    const newBrief = {
      my_asks: [
        {
          text: "Own the migration script and have it ready by Wednesday.",
          asker: "Priya",
          due: "Wednesday",
          quoted_span: {
            start_char: 0,
            end_char: 10,
            text: "stub-span ",
          },
        },
      ],
      others_asks: [],
      decisions: [],
      ambiguous_items: [],
      content_translation: [
        {
          label: "my_asks[0]: migration script",
          facets: [
            { kind: "input", text: "Priya assigned you the migration script." },
            { kind: "action", text: "Finish the script by Wednesday." },
            { kind: "goal", text: "Rollout starts on time." },
          ],
        },
      ],
      eval_corpus_slice: "brief_meeting-v0.2.0",
      model_provenance: {
        mode: "cloud" as const,
        provider: "anthropic",
        model: "claude-sonnet-4.6",
      },
    };
    const res = validateOutput("brief_meeting", newBrief);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("strips provider-added top-level fields before validation (REGRESSION: Gemini 'additional properties')", () => {
    // 0.0.26 — Gemini (direct or via OpenRouter) routinely returns
    // `safety_ratings`, `citations`, `groundings`, or `finish_reason`
    // alongside the legitimate output fields. Pre-0.0.26 AJV rejected
    // the whole response under additionalProperties:false. The
    // normalisation step now strips unknown top-level keys so the
    // schema-shaped fields survive untouched.
    const rawFromGemini = JSON.stringify({
      description: "A photo of a tabby cat sitting on a windowsill.",
      contains_text: false,
      key_elements: ["cat", "windowsill", "soft light"],
      inferred_purpose: "Pet photo, possibly for a social post.",
      // Gemini chatter the model adds without being asked:
      safety_ratings: [
        { category: "HARM_CATEGORY_DEROGATORY", probability: "NEGLIGIBLE" },
      ],
      citations: [],
      finish_reason: "stop",
    });
    const res = parseAndValidate("describe_image", rawFromGemini, provenance);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    const data = res.data as Record<string, unknown>;
    // The legitimate fields survived…
    expect(data.description).toMatch(/tabby cat/);
    expect(Array.isArray(data.key_elements)).toBe(true);
    // …and the provider noise was dropped.
    expect(data.safety_ratings).toBeUndefined();
    expect(data.citations).toBeUndefined();
    expect(data.finish_reason).toBeUndefined();
  });
});
