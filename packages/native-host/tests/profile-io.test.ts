import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readProfile,
  resolveProfilePath,
  writeProfile,
} from "../src/profile-io.js";

describe("profile-io", () => {
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "neurodock-host-"));
  });

  afterEach(() => {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
  });

  it("resolves to NEURODOCK_PROFILE_PATH when set", () => {
    const override = join(dir, "override.yaml");
    const p = resolveProfilePath({ env: { NEURODOCK_PROFILE_PATH: override } });
    expect(p).toBe(override);
  });

  it("resolves to $XDG_CONFIG_HOME/neurodock/profile.yaml when set", () => {
    const xdg = join(dir, "xdg");
    const p = resolveProfilePath({ env: { XDG_CONFIG_HOME: xdg } });
    expect(p).toBe(join(xdg, "neurodock", "profile.yaml"));
  });

  it("falls back to ~/.neurodock/profile.yaml", () => {
    const fakeHome = join(dir, "home");
    const p = resolveProfilePath({ home: fakeHome, env: {} });
    expect(p).toBe(join(fakeHome, ".neurodock", "profile.yaml"));
  });

  it("reads a missing file as exists:false without throwing", () => {
    const r = readProfile(join(dir, "absent.yaml"));
    expect(r.exists).toBe(false);
    expect(r.raw).toBeNull();
  });

  it("writes a new profile and reads it back", () => {
    const path = join(dir, "profile.yaml");
    const value = { identity: { display_name: "T", neurotypes: ["adhd"] } };
    const w = writeProfile(path, value);
    expect(w.created).toBe(true);
    const r = readProfile(path);
    expect(r.exists).toBe(true);
    expect(r.raw).toEqual(value);
  });

  it("preserves comments when patching an existing file", () => {
    const path = join(dir, "profile.yaml");
    const original = `# Hand-edited header\nidentity:\n  display_name: T\n  neurotypes:\n    - adhd\nprivacy:\n  telemetry: local_otel_only\n`;
    writeFileSync(path, original, "utf8");
    writeProfile(path, {
      identity: { display_name: "Alex", neurotypes: ["adhd"] },
      privacy: { telemetry: "local_otel_only" },
    });
    const after = readFileSync(path, "utf8");
    expect(after).toMatch(/Hand-edited header/);
    expect(after).toMatch(/display_name: Alex/);
  });
});
