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
