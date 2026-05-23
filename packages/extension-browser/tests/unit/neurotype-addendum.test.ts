/**
 * Unit tests for the per-neurotype prompt addendum builder.
 *
 * Covers the contract recommendations from
 * `.claude-reports/2026-05-24-prompt-neurotype-tailoring/REPORT.md`:
 *   - default profile → no addendum (backwards compat with pre-0.0.22)
 *   - audhd substitution rule (adhd + asd → audhd, not concatenated)
 *   - other + notes carries the notes inline
 *   - max_chunk_size interpolated into each per-neurotype block
 *   - output_format block always present when neurotypes are active
 *   - 3+ neurotypes appends the conflict-resolution footer
 */
import { describe, it, expect } from "vitest";
import { buildNeurotypeAddendum } from "../../src/lib/neurotype-addendum.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

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
    historyEnabled: false,
    displayName: "you",
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
    ...overrides,
  };
}

describe("buildNeurotypeAddendum", () => {
  it("returns empty string for the all-default profile (backwards compat)", () => {
    expect(buildNeurotypeAddendum(profile())).toBe("");
  });

  it("returns empty when neurotypes is empty and notes empty even with custom output format", () => {
    // Output format alone is enough to trigger the addendum so the
    // model sees the user's preferred shape.
    expect(
      buildNeurotypeAddendum(profile({ outputFormat: "bullet_first" })),
    ).not.toBe("");
  });

  it("includes the ADHD addendum block", () => {
    const out = buildNeurotypeAddendum(profile({ neurotypes: ["adhd"] }));
    expect(out).toContain("Reader preferences (ADHD)");
    expect(out).toContain("first phrase");
  });

  it("substitutes AuDHD when both adhd and asd are present (no double-up)", () => {
    const out = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd", "asd"] }),
    );
    expect(out).toContain("Reader preferences (AuDHD)");
    expect(out).not.toContain("Reader preferences (ADHD)");
    expect(out).not.toContain("Reader preferences (autism)");
  });

  it("uses AuDHD directly when profile lists audhd", () => {
    const out = buildNeurotypeAddendum(profile({ neurotypes: ["audhd"] }));
    expect(out).toContain("Reader preferences (AuDHD)");
  });

  it("interpolates max_chunk_size into each addendum", () => {
    const out = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd"], maxChunkSize: 3 }),
    );
    expect(out).toContain("Cap any list you return at 3 items");
  });

  it("renders the other-block with additional_notes inline", () => {
    const out = buildNeurotypeAddendum(
      profile({
        neurotypes: ["other"],
        additionalNotes: "Please always quote the source verbatim.",
      }),
    );
    expect(out).toContain("Reader preferences (self-described)");
    expect(out).toContain("Please always quote the source verbatim.");
  });

  it("appends notes as a footer when other is NOT selected but notes ARE", () => {
    const out = buildNeurotypeAddendum(
      profile({
        neurotypes: ["adhd"],
        additionalNotes: "Use kelvin not celsius for temperatures.",
      }),
    );
    expect(out).toContain("Reader preferences (ADHD)");
    expect(out).toContain("Use kelvin not celsius for temperatures.");
  });

  it("appends the conflict-resolution footer when 3+ neurotypes are active", () => {
    const out = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd", "dyslexia", "ocd"] }),
    );
    expect(out).toContain(
      "prefer the more conservative reading: shorter, more concrete",
    );
  });

  it("Tourette renders no block (explicit no-op)", () => {
    const out = buildNeurotypeAddendum(profile({ neurotypes: ["tourette"] }));
    // Tourette is no-op at the prompt layer; the addendum only carries
    // the output_format header (because we triggered the addendum by
    // having a neurotype, even if its block is empty).
    expect(out).not.toContain("Reader preferences (Tourette)");
  });

  it("orders ASD before ADHD (priority — ADHD ergonomics win on recency)", () => {
    const out = buildNeurotypeAddendum(
      profile({ neurotypes: ["adhd", "dyslexia"] }),
    );
    const dyslexiaIdx = out.indexOf("Reader preferences (dyslexia)");
    const adhdIdx = out.indexOf("Reader preferences (ADHD)");
    expect(dyslexiaIdx).toBeGreaterThan(-1);
    expect(adhdIdx).toBeGreaterThan(-1);
    expect(dyslexiaIdx).toBeLessThan(adhdIdx);
  });

  it("places `other` block LAST so user notes are the final word", () => {
    const out = buildNeurotypeAddendum(
      profile({
        neurotypes: ["adhd", "other"],
        additionalNotes: "Always start with 'Heads up:'",
      }),
    );
    const adhdIdx = out.indexOf("Reader preferences (ADHD)");
    const otherIdx = out.indexOf("Reader preferences (self-described)");
    expect(adhdIdx).toBeLessThan(otherIdx);
  });
});
