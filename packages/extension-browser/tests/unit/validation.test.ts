import { describe, it, expect, beforeEach } from "vitest";
import {
  parseAndValidate,
  validateOutput,
  extractJson,
  _resetValidatorsForTests,
} from "../../src/lib/validation.js";

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
    const raw =
      "Here is the output:\n```json\n{\"ok\":true}\n```\n\nThanks!";
    expect(extractJson(raw)).toBe('{"ok":true}');
  });

  it("extracts JSON from raw prose with trailing braces", () => {
    expect(extractJson("Sure! {\"a\":1}")).toBe('{"a":1}');
  });

  it("reports parse error on broken JSON", () => {
    const res = parseAndValidate("translate_incoming", "{not-json");
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/JSON parse error|Could not locate/);
  });
});
