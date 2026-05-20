import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { validateProfile } from "../src/profile/validator.js";
import { applyDefaults, PROFILE_DEFAULTS } from "../src/profile/defaults.js";

const repoRoot = resolve(__dirname, "..", "..", "..");
const minimalPath = resolve(
  repoRoot,
  "packages",
  "core",
  "schemas",
  "profile.minimal.yaml",
);
const examplePath = resolve(
  repoRoot,
  "packages",
  "core",
  "schemas",
  "profile.example.yaml",
);

function loadYaml(p: string): unknown {
  return parse(readFileSync(p, "utf8"));
}

describe("profile validator", () => {
  it("accepts the minimal profile template", () => {
    const r = validateProfile(loadYaml(minimalPath));
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("accepts the example profile template", () => {
    const r = validateProfile(loadYaml(examplePath));
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("allows unknown top-level keys (forward-compat per ADR 0004)", () => {
    const r = validateProfile({
      identity: { display_name: "T", neurotypes: ["adhd"] },
      future_field: { coming_in: "v0.2.0" },
    });
    expect(r.valid).toBe(true);
  });

  it("reports field path on invalid enum value", () => {
    const r = validateProfile({
      identity: { display_name: "T", neurotypes: ["adhd"] },
      preferences: { output_format: "telepathy" },
    });
    expect(r.valid).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
    const v = r.violations[0]!;
    expect(v.path).toContain("output_format");
  });

  it("rejects a profile that is missing identity", () => {
    const r = validateProfile({ preferences: { motion: "reduced" } });
    expect(r.valid).toBe(false);
  });
});

describe("defaults", () => {
  it("applies defaults for missing blocks without mutating input", () => {
    const input = { identity: { display_name: "T", neurotypes: ["adhd"] } };
    const out = applyDefaults(input);
    expect(out["preferences"]).toMatchObject(PROFILE_DEFAULTS.preferences);
    expect(out["chronometric"]).toMatchObject(PROFILE_DEFAULTS.chronometric);
    expect(out["guardrails"]).toMatchObject(PROFILE_DEFAULTS.guardrails);
    expect(out["privacy"]).toMatchObject(PROFILE_DEFAULTS.privacy);
    // Input untouched.
    expect((input as { preferences?: unknown }).preferences).toBeUndefined();
  });

  it("preserves user-set values when present", () => {
    const out = applyDefaults({
      identity: { display_name: "T", neurotypes: ["adhd"] },
      preferences: { max_chunk_size: 5 },
    });
    const prefs = out["preferences"] as Record<string, unknown>;
    expect(prefs["max_chunk_size"]).toBe(5);
    expect(prefs["output_format"]).toBe("answer_first");
  });
});
