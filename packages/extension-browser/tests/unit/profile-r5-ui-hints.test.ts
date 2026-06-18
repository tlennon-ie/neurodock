/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * R5 UI-hint profile plumbing.
 *
 * The two new OPTIONAL preference fields must flow through the extension
 * profile mapping in both directions:
 *   - `voiceInputPreferred`  ↔ `preferences.voice_input_preferred`
 *   - `lineHeightHint`       ↔ `preferences.line_height_hint`
 *
 * Both are optional; absence MUST mean exactly today's behaviour
 * (backward-compatible). A profile that declares neither field must
 * normalise byte-identically to the pre-R5 normaliser output.
 */
import { describe, it, expect } from "vitest";
import {
  normaliseProfile,
  mapExtensionProfileToOnDisk,
} from "../../src/lib/profile.js";

describe("profile R5 UI hints — normaliseProfile", () => {
  it("preserves voiceInputPreferred=true", () => {
    const p = normaliseProfile({ voiceInputPreferred: true });
    expect(p.voiceInputPreferred).toBe(true);
  });

  it("preserves a valid lineHeightHint", () => {
    const p = normaliseProfile({ lineHeightHint: "relaxed" });
    expect(p.lineHeightHint).toBe("relaxed");
  });

  it("drops an invalid lineHeightHint (defends the WCAG mapping)", () => {
    const p = normaliseProfile({
      lineHeightHint: "huge" as unknown as "relaxed",
    });
    expect(p.lineHeightHint).toBeUndefined();
  });

  it("coerces a non-boolean voiceInputPreferred to undefined/false-y", () => {
    const p = normaliseProfile({
      voiceInputPreferred: "yes" as unknown as boolean,
    });
    expect(p.voiceInputPreferred).not.toBe(true);
  });

  it("leaves both fields undefined when neither is provided (back-compat)", () => {
    const p = normaliseProfile({ neurotypes: ["adhd"] });
    expect(p.voiceInputPreferred).toBeUndefined();
    expect(p.lineHeightHint).toBeUndefined();
  });

  it("a profile without the R5 fields normalises identically to before", () => {
    // The presence of the new optional fields must not perturb any
    // existing field for a profile that does not declare them.
    const legacyInput = {
      mode: "local" as const,
      localProvider: "ollama" as const,
      localEndpoint: "http://localhost:11434",
      localModel: "llama3.2:3b",
      cloudProvider: null,
      cloudApiKey: null,
      cloudApiKeys: {},
      historyEnabled: true,
      displayName: "T",
      neurotypes: ["adhd"] as const,
      outputFormat: "bullet_first" as const,
      maxChunkSize: 4,
      additionalNotes: "keep it short",
      onboardingComplete: true,
    };
    const out = normaliseProfile({ ...legacyInput });
    // No R5 keys leak in.
    expect(out.voiceInputPreferred).toBeUndefined();
    expect(out.lineHeightHint).toBeUndefined();
    // Every pre-R5 field is preserved exactly.
    expect(out.displayName).toBe("T");
    expect(out.historyEnabled).toBe(true);
    expect(out.neurotypes).toEqual(["adhd"]);
    expect(out.outputFormat).toBe("bullet_first");
    expect(out.maxChunkSize).toBe(4);
    expect(out.additionalNotes).toBe("keep it short");
    expect(out.onboardingComplete).toBe(true);
  });
});

describe("profile R5 UI hints — mapExtensionProfileToOnDisk", () => {
  function base() {
    return normaliseProfile({ displayName: "you" });
  }

  it("writes voice_input_preferred only when set", () => {
    const withFlag = mapExtensionProfileToOnDisk(
      normaliseProfile({ voiceInputPreferred: true }),
    );
    const prefs = (withFlag as { preferences: Record<string, unknown> })
      .preferences;
    expect(prefs["voice_input_preferred"]).toBe(true);
  });

  it("writes line_height_hint only when set", () => {
    const withHint = mapExtensionProfileToOnDisk(
      normaliseProfile({ lineHeightHint: "compact" }),
    );
    const prefs = (withHint as { preferences: Record<string, unknown> })
      .preferences;
    expect(prefs["line_height_hint"]).toBe("compact");
  });

  it("omits both keys from the on-disk shape when unset (back-compat)", () => {
    const onDisk = mapExtensionProfileToOnDisk(base());
    const prefs = (onDisk as { preferences: Record<string, unknown> })
      .preferences;
    expect("voice_input_preferred" in prefs).toBe(false);
    expect("line_height_hint" in prefs).toBe(false);
    // The pre-R5 preference keys are still written.
    expect(prefs["output_format"]).toBeDefined();
    expect(prefs["max_chunk_size"]).toBeDefined();
  });
});
