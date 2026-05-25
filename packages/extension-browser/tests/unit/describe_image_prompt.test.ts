/**
 * describe_image_prompt.test.ts
 *
 * Pins the 0.0.30 rewrite of the describe_image prompt. The 0.0.28 prompt
 * was missing the "Cognitive Accessibility Expert" framing and treated
 * `content_translation` as an optional decoration of `description`. Small
 * 4B-class local models obeyed the schema's required-keys list literally
 * and filled `description` with a layout-style summary while leaving
 * `content_translation: null` — the bug we shipped 0.0.28 to fix went
 * un-fixed because the schema change was structural and the prompt change
 * was cosmetic.
 *
 * These assertions ensure a future refactor cannot accidentally regress
 * the prompt back to a description-led shape.
 */
import { describe, it, expect } from "vitest";
import describeImagePrompt from "../../src/lib/prompts/describe_image.prompt.md?raw";

describe("describe_image prompt — 0.0.30 translate-not-summarize framing", () => {
  it("opens with the Cognitive Accessibility Expert role", () => {
    // The user's own working prompt (saved at
    // .claude-reports/gemini-result.md) starts with this role declaration.
    // Local 4B-class models obey roles; we lead with one.
    expect(describeImagePrompt).toContain("Cognitive Accessibility Expert");
  });

  it("contains the literal Crucial Rules: DO NOT transcribe", () => {
    // The user's prompt explicitly forbids transcription. Our prompt now
    // mirrors that as a Crucial Rule so the model can't fall back to
    // "summarise the page text".
    expect(describeImagePrompt).toContain("DO NOT transcribe");
  });

  it("forbids describing layout/colors/icons as the primary output", () => {
    expect(describeImagePrompt).toMatch(
      /DO NOT describe the layout, colors, or icons/i,
    );
  });

  it("requires cause-and-effect (Logic First) phrasing", () => {
    expect(describeImagePrompt).toContain("Logic First");
    expect(describeImagePrompt).toContain("cause and effect");
  });

  it("demotes the legacy description field below content_translation", () => {
    // The prompt must say the legacy fields are accessibility-tech metadata,
    // not the primary output. This is the structural fix that prevents
    // models from filling `description` and considering themselves done.
    expect(describeImagePrompt).toMatch(/accessibility-tech metadata/i);
    expect(describeImagePrompt).toMatch(
      /primary output[^.]*content_translation/i,
    );
  });

  it("declares content_translation MUST contain at least 1 entry for instructional images", () => {
    // The bug was that small models treated content_translation as
    // optional. The prompt now states the requirement in MUST form so
    // the model can't dodge.
    expect(describeImagePrompt).toContain("MUST contain at least 1 entry");
  });

  it("classifies INSTRUCTIONAL/STRUCTURED images and lists document pages with section headings", () => {
    // The Harness "Feature Flags" page that broke 0.0.28 is a document
    // page with section headings. The prompt must explicitly include that
    // case in the INSTRUCTIONAL category — otherwise the model anchors on
    // "screenshot of a written article" → "describe the article".
    expect(describeImagePrompt).toContain("INSTRUCTIONAL");
    expect(describeImagePrompt).toMatch(
      /document page|documentation page|screenshot of a written article/i,
    );
  });

  it("includes a worked example for the Harness Feature Flags page", () => {
    // The 0.0.28 prompt's only worked example was the EI infographic.
    // 0.0.30 adds a worked example for the case the user actually broke
    // it on — a Harness docs page with a section heading + subsection +
    // code block.
    expect(describeImagePrompt).toMatch(/Harness/);
    expect(describeImagePrompt).toMatch(/Feature Flags/);
    expect(describeImagePrompt).toMatch(/Decouple Deployment from Release/);
  });

  it("explicitly forbids empty content_translation arrays", () => {
    // The schema enforces minItems:1 but the prompt also tells the model
    // not to emit `[]` so it doesn't try and fail validation.
    expect(describeImagePrompt).toMatch(
      /empty[^.]*content_translation[^.]*not permitted|content_translation: \[\][^.]*NOT permitted/i,
    );
  });

  it("preserves the {image_url} / {page_url} / {alt_text} placeholders", () => {
    // prompt-builder.ts renders these. If they're missing, every call
    // emits "(not provided)" silently.
    expect(describeImagePrompt).toContain("{image_url}");
    expect(describeImagePrompt).toContain("{page_url}");
    expect(describeImagePrompt).toContain("{alt_text}");
  });
});
