/**
 * prompt-builder.test.ts
 *
 * Unit tests for buildPrompt({ tool, input }) in src/lib/prompt-builder.ts.
 *
 * These tests exercise the REAL function against the REAL prompt templates and
 * schemas. No mocking of buildPrompt or its dependencies.
 *
 * Coverage targets:
 *   1. Single-brace placeholder substitution
 *   2. Double-brace literals are preserved ({{foo}} → not collapsed)
 *   3. Missing input key → "(not provided)"
 *   4. Array stringification (non-empty and empty)
 *   5. Object stringification (JSON form)
 *   6. Schema suffix — every tool output ends with a valid JSON Schema block
 *   7. All four tools build without throwing
 */

import { describe, it, expect } from "vitest";
import { buildPrompt } from "../../src/lib/prompt-builder.js";
import type { TranslationTool } from "../../src/lib/types.js";

// ---------------------------------------------------------------------------
// Minimal valid inputs per tool (all template placeholders populated so we
// can assert on specific rendered values without "(not provided)" noise unless
// we intentionally omit a key).
// ---------------------------------------------------------------------------

const TRANSLATE_INCOMING_INPUT: Record<string, unknown> = {
  channel: "gmail",
  target_language: "en",
  thread_context: [],
  text: "hello",
  deterministic_summary: "no ambiguity detected",
};

const CHECK_TONE_INPUT: Record<string, unknown> = {
  channel: "slack",
  target_register: "direct",
  baseline_messages: [],
  text: "Fix it now.",
  deterministic_summary: "no baseline",
};

const REWRITE_OUTGOING_INPUT: Record<string, unknown> = {
  channel: "email",
  target_register: "warm",
  preserve_intent: "keep the ask intact",
  preserve_terms: [],
  text: "Please send the report.",
  deterministic_summary: "baseline rewrite",
};

const BRIEF_MEETING_INPUT: Record<string, unknown> = {
  me: "Alice",
  project: "NeuroDock",
  speakers: ["Alice", "Bob"],
  transcript: "Alice: can you send the report?\nBob: sure.",
  deterministic_summary: "one ask",
};

// ---------------------------------------------------------------------------
// 1. Single-brace substitution
// ---------------------------------------------------------------------------

describe("buildPrompt — single-brace placeholder substitution", () => {
  it("replaces {text} and {channel} with input values for translate_incoming", () => {
    const result = buildPrompt({
      tool: "translate_incoming",
      input: { ...TRANSLATE_INCOMING_INPUT, text: "hello", channel: "gmail" },
    });

    // Rendered values appear in the output
    expect(result).toContain("hello");
    expect(result).toContain("gmail");

    // Raw placeholder tokens do NOT remain in the output
    expect(result).not.toContain("{text}");
    expect(result).not.toContain("{channel}");
  });

  it("replaces {channel} and {text} for check_tone", () => {
    const result = buildPrompt({
      tool: "check_tone",
      input: { ...CHECK_TONE_INPUT, channel: "slack", text: "Fix it now." },
    });

    expect(result).toContain("slack");
    expect(result).toContain("Fix it now.");
    expect(result).not.toContain("{channel}");
    expect(result).not.toContain("{text}");
  });

  it("replaces {channel} and {text} for rewrite_outgoing", () => {
    const result = buildPrompt({
      tool: "rewrite_outgoing",
      input: {
        ...REWRITE_OUTGOING_INPUT,
        channel: "email",
        text: "Please send the report.",
      },
    });

    expect(result).toContain("email");
    expect(result).toContain("Please send the report.");
    expect(result).not.toContain("{channel}");
    expect(result).not.toContain("{text}");
  });

  it("replaces {me}, {project}, and {transcript} for brief_meeting", () => {
    const result = buildPrompt({
      tool: "brief_meeting",
      input: {
        ...BRIEF_MEETING_INPUT,
        me: "Alice",
        project: "NeuroDock",
        transcript: "Alice: done.",
      },
    });

    expect(result).toContain("Alice");
    expect(result).toContain("NeuroDock");
    expect(result).toContain("Alice: done.");
    expect(result).not.toContain("{me}");
    expect(result).not.toContain("{project}");
    expect(result).not.toContain("{transcript}");
  });
});

// ---------------------------------------------------------------------------
// 2. Double-brace literals are preserved
//    The regex (?<!\{)\{([a-z_][a-z0-9_]*)\}(?!\}) must leave {{...}} alone.
//    All four templates contain {{...}} examples from the Python side.
// ---------------------------------------------------------------------------

describe("buildPrompt — double-brace literals are preserved", () => {
  it("does NOT collapse {{text, confidence}} in translate_incoming prompt", () => {
    const result = buildPrompt({
      tool: "translate_incoming",
      input: TRANSLATE_INCOMING_INPUT,
    });

    // The template contains `{{text, confidence}}` as a Markdown-safe literal.
    // After rendering, the doubled braces must remain intact.
    expect(result).toContain("{{");
    expect(result).toContain("}}");
  });

  it("does NOT collapse {{directness, warmth, urgency}} in check_tone prompt", () => {
    const result = buildPrompt({
      tool: "check_tone",
      input: CHECK_TONE_INPUT,
    });

    expect(result).toContain("{{");
    expect(result).toContain("}}");
  });

  it("does NOT collapse {{tone_shift, ...}} in rewrite_outgoing prompt", () => {
    const result = buildPrompt({
      tool: "rewrite_outgoing",
      input: REWRITE_OUTGOING_INPUT,
    });

    expect(result).toContain("{{");
    expect(result).toContain("}}");
  });

  it("does NOT collapse {{text, asker, due, ...}} in brief_meeting prompt", () => {
    const result = buildPrompt({
      tool: "brief_meeting",
      input: BRIEF_MEETING_INPUT,
    });

    expect(result).toContain("{{");
    expect(result).toContain("}}");
  });
});

// ---------------------------------------------------------------------------
// 3. Missing input key → "(not provided)"
// ---------------------------------------------------------------------------

describe("buildPrompt — missing input key stringification", () => {
  it("emits (not provided) when a referenced key is absent from input", () => {
    // Omit 'target_language' which is referenced by translate_incoming template
    const inputWithoutTargetLanguage: Record<string, unknown> = {
      channel: "email",
      // target_language intentionally omitted
      thread_context: [],
      text: "test message",
      deterministic_summary: "none",
    };

    const result = buildPrompt({
      tool: "translate_incoming",
      input: inputWithoutTargetLanguage,
    });

    expect(result).toContain("(not provided)");
  });

  it("emits (not provided) when 'text' is explicitly absent for check_tone", () => {
    const inputWithoutText: Record<string, unknown> = {
      channel: "slack",
      target_register: "direct",
      baseline_messages: [],
      // text intentionally omitted
      deterministic_summary: "none",
    };

    const result = buildPrompt({
      tool: "check_tone",
      input: inputWithoutText,
    });

    expect(result).toContain("(not provided)");
  });
});

// ---------------------------------------------------------------------------
// 4. Array stringification
// ---------------------------------------------------------------------------

describe("buildPrompt — array stringification", () => {
  it("renders a non-empty thread_context array with indexed bullet lines", () => {
    const result = buildPrompt({
      tool: "translate_incoming",
      input: {
        ...TRANSLATE_INCOMING_INPUT,
        thread_context: ["first message", "second message"],
      },
    });

    expect(result).toContain("- [0] first message");
    expect(result).toContain("- [1] second message");
  });

  it("renders an empty thread_context array as (none)", () => {
    const result = buildPrompt({
      tool: "translate_incoming",
      input: {
        ...TRANSLATE_INCOMING_INPUT,
        thread_context: [],
      },
    });

    expect(result).toContain("(none)");
  });

  it("renders non-empty baseline_messages for check_tone with indexed bullets", () => {
    const result = buildPrompt({
      tool: "check_tone",
      input: {
        ...CHECK_TONE_INPUT,
        baseline_messages: ["a", "b", "c"],
      },
    });

    expect(result).toContain("- [0] a");
    expect(result).toContain("- [1] b");
    expect(result).toContain("- [2] c");
  });

  it("renders empty baseline_messages as (none) for check_tone", () => {
    const result = buildPrompt({
      tool: "check_tone",
      input: {
        ...CHECK_TONE_INPUT,
        baseline_messages: [],
      },
    });

    expect(result).toContain("(none)");
  });

  it("renders non-empty preserve_terms for rewrite_outgoing with indexed bullets", () => {
    const result = buildPrompt({
      tool: "rewrite_outgoing",
      input: {
        ...REWRITE_OUTGOING_INPUT,
        preserve_terms: ["API", "SLA"],
      },
    });

    expect(result).toContain("- [0] API");
    expect(result).toContain("- [1] SLA");
  });

  it("renders empty preserve_terms as (none) for rewrite_outgoing", () => {
    const result = buildPrompt({
      tool: "rewrite_outgoing",
      input: {
        ...REWRITE_OUTGOING_INPUT,
        preserve_terms: [],
      },
    });

    expect(result).toContain("(none)");
  });
});

// ---------------------------------------------------------------------------
// 5. Object stringification
// ---------------------------------------------------------------------------

describe("buildPrompt — object stringification", () => {
  it("renders an object value as its JSON form", () => {
    // Use `speakers` in brief_meeting which accepts a list (rendered via stringify).
    // Supply a plain object instead to exercise the object branch of stringify.
    const speakersObj = { from: "Alice", to: "Bob" };
    const result = buildPrompt({
      tool: "brief_meeting",
      input: {
        ...BRIEF_MEETING_INPUT,
        speakers: speakersObj,
      },
    });

    expect(result).toContain(JSON.stringify(speakersObj));
  });

  it("renders a nested object in deterministic_summary for translate_incoming", () => {
    const summaryObj = { sentiment: "neutral", confidence: 0.9 };
    const result = buildPrompt({
      tool: "translate_incoming",
      input: {
        ...TRANSLATE_INCOMING_INPUT,
        deterministic_summary: summaryObj,
      },
    });

    expect(result).toContain(JSON.stringify(summaryObj));
  });
});

// ---------------------------------------------------------------------------
// 6. Schema suffix — every tool output ends with a valid JSON Schema block
// ---------------------------------------------------------------------------

describe("buildPrompt — schema suffix", () => {
  const tools: TranslationTool[] = [
    "translate_incoming",
    "check_tone",
    "rewrite_outgoing",
    "brief_meeting",
    "describe_image",
  ];

  const MINIMAL_INPUTS: Record<TranslationTool, Record<string, unknown>> = {
    translate_incoming: TRANSLATE_INCOMING_INPUT,
    check_tone: CHECK_TONE_INPUT,
    rewrite_outgoing: REWRITE_OUTGOING_INPUT,
    brief_meeting: BRIEF_MEETING_INPUT,
    describe_image: {
      image_url: "https://example.com/image.png",
      page_url: "https://example.com/page",
      alt_text: "",
    },
  };

  it.each(tools)(
    "output for %s ends with the ## Output JSON Schema header and a parseable json block",
    (tool) => {
      const result = buildPrompt({ tool, input: MINIMAL_INPUTS[tool] });

      // Header line must be present
      expect(result).toContain("## Output JSON Schema (draft-2020-12)");

      // Extract JSON from the fenced code block at the end
      const fenceMatch = result.match(/```json\n([\s\S]*?)\n```\s*$/);
      expect(fenceMatch).not.toBeNull();

      const jsonText = fenceMatch![1]!;
      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(jsonText);
      }).not.toThrow();

      // The schema must be an object with a top-level "type" property
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");
      expect(parsed).not.toBeNull();
      expect((parsed as Record<string, unknown>).type).toBeDefined();
    },
  );
});

// ---------------------------------------------------------------------------
// 7. All four tools build without throwing
// ---------------------------------------------------------------------------

describe("buildPrompt — all four tools build without throwing", () => {
  const tools: TranslationTool[] = [
    "translate_incoming",
    "check_tone",
    "rewrite_outgoing",
    "brief_meeting",
    "describe_image",
  ];

  const MINIMAL_INPUTS: Record<TranslationTool, Record<string, unknown>> = {
    translate_incoming: TRANSLATE_INCOMING_INPUT,
    check_tone: CHECK_TONE_INPUT,
    rewrite_outgoing: REWRITE_OUTGOING_INPUT,
    brief_meeting: BRIEF_MEETING_INPUT,
    describe_image: {
      image_url: "https://example.com/image.png",
      page_url: "https://example.com/page",
      alt_text: "",
    },
  };

  it.each(tools)(
    "buildPrompt for tool=%s does not throw and returns a non-empty string",
    (tool) => {
      let result: string | undefined;

      expect(() => {
        result = buildPrompt({ tool, input: MINIMAL_INPUTS[tool] });
      }).not.toThrow();

      expect(typeof result).toBe("string");
      expect((result as string).length).toBeGreaterThan(0);
    },
  );
});
