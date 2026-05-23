/**
 * 0.0.22 — structural JSON repair for truncated local-model responses.
 *
 * gemma-4-e4b and similar small models routinely truncate JSON mid-array
 * when describing complex images. repairTruncatedJson is the
 * best-effort safety net so partial-but-recoverable responses still
 * reach the user.
 */
import { describe, it, expect } from "vitest";
import {
  parseAndValidate,
  repairTruncatedJson,
} from "../../src/lib/validation.js";
import type { ModelProvenance } from "../../src/lib/types.js";

const provenance: ModelProvenance = {
  mode: "local",
  provider: "lmstudio",
  model: "gemma-4-e4b",
};

describe("repairTruncatedJson", () => {
  it("closes a truncated array with no trailing comma", () => {
    const broken = '{"items": ["a", "b", "c"';
    const repaired = repairTruncatedJson(broken);
    expect(repaired).not.toBeNull();
    expect(() => JSON.parse(repaired ?? "")).not.toThrow();
  });

  it("closes a truncated array WITH trailing comma (the gemma case)", () => {
    const broken = '{"key_elements": ["bar chart", "axis labels",';
    const repaired = repairTruncatedJson(broken);
    expect(repaired).not.toBeNull();
    const parsed = JSON.parse(repaired ?? "") as Record<string, unknown>;
    expect(Array.isArray(parsed.key_elements)).toBe(true);
    expect((parsed.key_elements as unknown[]).length).toBe(2);
  });

  it("closes a truncated string + array + object together", () => {
    const broken = '{"a": [{"b": "incomplete';
    const repaired = repairTruncatedJson(broken);
    expect(repaired).not.toBeNull();
    expect(() => JSON.parse(repaired ?? "")).not.toThrow();
  });

  it("returns null for already-balanced JSON (nothing to repair)", () => {
    // If the original parse failed for a non-truncation reason, repair
    // shouldn't pretend it fixed it.
    expect(repairTruncatedJson('{"a": 1}')).toBeNull();
  });

  it("returns null for a structurally damaged input (mismatched brackets)", () => {
    expect(repairTruncatedJson('{"a": [}')).toBeNull();
  });

  it("returns null for input that does not start with { or [", () => {
    expect(repairTruncatedJson("just prose")).toBeNull();
  });

  it("integration: parseAndValidate recovers a truncated describe_image response", () => {
    const truncated = JSON.stringify({
      description: "A round avatar with a stylised brain motif.",
      contains_text: false,
      key_elements: ["round avatar", "brain icon", "beige background"],
      inferred_purpose: "GitHub user avatar.",
    });
    // Cut the JSON 8 chars before the end, leaving the inferred_purpose
    // mid-string. The repair should close the string + the object.
    const broken = truncated.slice(0, truncated.length - 8);
    const result = parseAndValidate("describe_image", broken, provenance);
    expect(result.ok).toBe(true);
  });
});
