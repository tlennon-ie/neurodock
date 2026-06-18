/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * neurotype-addenda.test.ts — unit tests for the shared assembler.
 *
 * These exercise the assembly rules in isolation against the shipped v1
 * artifact: fusion, priority ordering, per-tool vs generic fallback, token
 * interpolation, voice-input gating, and the 3+ conflict footer. The
 * byte-identical cross-surface guarantee is proven separately by the
 * extension's golden-snapshot test.
 */
import { describe, expect, test } from "vitest";
import {
  assembleNeurotypeAddendum,
  neurotypeAddendaV1,
  type AssembleNeurotypeAddendumOptions,
} from "./neurotype-addenda.js";

function assemble(
  overrides: Partial<AssembleNeurotypeAddendumOptions> = {},
): string {
  return assembleNeurotypeAddendum(neurotypeAddendaV1, {
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
    ...overrides,
  });
}

describe("assembleNeurotypeAddendum — empty gate", () => {
  test("returns empty string for the all-default case", () => {
    expect(assemble()).toBe("");
  });

  test("a non-default output_format alone triggers the addendum", () => {
    expect(assemble({ outputFormat: "bullet_first" })).not.toBe("");
  });

  test("the voice-input flag alone triggers the addendum", () => {
    expect(assemble({ voiceInputPreferred: true })).not.toBe("");
  });

  test("notes alone trigger the addendum", () => {
    expect(assemble({ additionalNotes: "always quote the source" })).not.toBe(
      "",
    );
  });
});

describe("assembleNeurotypeAddendum — fusion (AuDHD)", () => {
  test("adhd + asd fuse to AuDHD (not concatenated)", () => {
    const out = assemble({ neurotypes: ["adhd", "asd"] });
    expect(out).toContain("Reader preferences (AuDHD)");
    expect(out).not.toContain("Reader preferences (ADHD)");
    expect(out).not.toContain("Reader preferences (autism)");
  });

  test("audhd declared directly uses the AuDHD block", () => {
    const out = assemble({ neurotypes: ["audhd"] });
    expect(out).toContain("Reader preferences (AuDHD)");
  });

  test("tourette + adhd + asd: AuDHD fuses, tourette stays, no raw ADHD", () => {
    const out = assemble({ neurotypes: ["tourette", "adhd", "asd"] });
    expect(out).toContain("Reader preferences (Tourette)");
    expect(out).toContain("Reader preferences (AuDHD)");
    expect(out).not.toContain("Reader preferences (ADHD):");
  });
});

describe("assembleNeurotypeAddendum — priority ordering", () => {
  test("dyslexia is placed before ADHD (priority/recency)", () => {
    const out = assemble({ neurotypes: ["adhd", "dyslexia"] });
    const dyslexiaIdx = out.indexOf("Reader preferences (dyslexia)");
    const adhdIdx = out.indexOf("Reader preferences (ADHD)");
    expect(dyslexiaIdx).toBeGreaterThan(-1);
    expect(adhdIdx).toBeGreaterThan(-1);
    expect(dyslexiaIdx).toBeLessThan(adhdIdx);
  });

  test("other is always last", () => {
    const out = assemble({
      neurotypes: ["adhd", "other"],
      additionalNotes: "Always start with 'Heads up:'",
    });
    const adhdIdx = out.indexOf("Reader preferences (ADHD)");
    const otherIdx = out.indexOf("Reader preferences (self-described)");
    expect(adhdIdx).toBeLessThan(otherIdx);
  });
});

describe("assembleNeurotypeAddendum — per-tool vs generic fallback", () => {
  test("with a tool, the concrete per-tool block is used", () => {
    const out = assemble({
      neurotypes: ["adhd"],
      tool: "translate_incoming",
    });
    expect(out).toContain("Reader preferences (ADHD) — translate_incoming:");
  });

  test("without a tool, the generic fallback block is used", () => {
    const out = assemble({ neurotypes: ["adhd"] });
    expect(out).toContain("Reader preferences (ADHD):");
    expect(out).toContain("first phrase");
  });

  test("an unknown tool falls back to the generic block", () => {
    const out = assemble({ neurotypes: ["adhd"], tool: "no_such_tool" });
    expect(out).toContain("Reader preferences (ADHD):");
  });
});

describe("assembleNeurotypeAddendum — token interpolation", () => {
  test("max_chunk_size is interpolated into the generic block", () => {
    const out = assemble({ neurotypes: ["adhd"], maxChunkSize: 3 });
    expect(out).toContain("Cap any list you return at 3 items");
    expect(out).not.toContain("{max_chunk_size}");
  });

  test("max_chunk_size is interpolated into a per-tool block", () => {
    const out = assemble({
      neurotypes: ["adhd"],
      tool: "translate_incoming",
      maxChunkSize: 7,
    });
    expect(out).toContain("'likely_subtext': cap at 7 items");
    expect(out).not.toContain("{max_chunk_size}");
  });

  test("notes are interpolated into the self-described block", () => {
    const out = assemble({
      neurotypes: ["other"],
      additionalNotes: "Please always quote the source verbatim.",
    });
    expect(out).toContain("Reader preferences (self-described)");
    expect(out).toContain("Please always quote the source verbatim.");
    expect(out).not.toContain("{notes}");
  });

  test("notes are appended as a footer when other is NOT selected", () => {
    const out = assemble({
      neurotypes: ["adhd"],
      additionalNotes: "Use kelvin not celsius for temperatures.",
    });
    expect(out).toContain("Reader preferences (ADHD)");
    expect(out).toContain("Use kelvin not celsius for temperatures.");
  });
});

describe("assembleNeurotypeAddendum — voice-input gating", () => {
  test("emits the single-block instruction when voice input is preferred", () => {
    const out = assemble({
      outputFormat: "bullet_first",
      voiceInputPreferred: true,
    });
    expect(out).toContain("single, copy-pasteable block");
  });

  test("does NOT emit the voice-input line when the flag is false", () => {
    const out = assemble({ neurotypes: ["adhd"], voiceInputPreferred: false });
    expect(out).toContain("Reader preferences (ADHD)");
    expect(out).not.toContain("copy-pasteable block");
  });

  test("does NOT emit the voice-input line when the flag is unset", () => {
    const out = assemble({ neurotypes: ["adhd"] });
    expect(out).not.toContain("copy-pasteable block");
  });
});

describe("assembleNeurotypeAddendum — conflict footer", () => {
  test("appends the conflict footer when 3+ neurotypes are active", () => {
    const out = assemble({ neurotypes: ["adhd", "dyslexia", "ocd"] });
    expect(out).toContain(
      "prefer the more conservative reading: shorter, more concrete",
    );
  });

  test("does NOT append the conflict footer for fewer than 3", () => {
    const out = assemble({ neurotypes: ["adhd", "dyslexia"] });
    expect(out).not.toContain("prefer the more conservative reading");
  });
});

describe("assembleNeurotypeAddendum — purity", () => {
  test("does not mutate the input neurotypes array", () => {
    const neurotypes = ["adhd", "asd"];
    assembleNeurotypeAddendum(neurotypeAddendaV1, {
      neurotypes,
      maxChunkSize: 5,
    });
    expect(neurotypes).toEqual(["adhd", "asd"]);
  });
});
