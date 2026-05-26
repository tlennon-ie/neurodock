import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../src/commands/doctor.js";

function sandbox(): { root: string; profile: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-doctor-"));
  const profile = join(root, "profile.yaml");
  return {
    root,
    profile,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

describe("neurodock doctor", () => {
  it("fails when no profile exists", async () => {
    const s = sandbox();
    try {
      process.env["NEURODOCK_PROFILE_PATH"] = s.profile;
      const r = await runDoctor();
      const names = r.checks.map((c) => c.name);
      expect(names).toContain("Profile exists");
      const fail = r.checks.find((c) => c.name === "Profile exists");
      expect(fail?.status).toBe("FAIL");
      expect(r.ok).toBe(false);
    } finally {
      delete process.env["NEURODOCK_PROFILE_PATH"];
      s.cleanup();
    }
  });

  it("passes profile checks when profile is valid", async () => {
    const s = sandbox();
    try {
      writeFileSync(
        s.profile,
        "identity:\n  display_name: tester\n  neurotypes:\n    - adhd\n",
      );
      process.env["NEURODOCK_PROFILE_PATH"] = s.profile;
      const r = await runDoctor();
      const profile = r.checks.find((c) => c.name === "Profile exists");
      const schema = r.checks.find((c) => c.name === "Profile schema valid");
      expect(profile?.status).toBe("PASS");
      expect(schema?.status).toBe("PASS");
    } finally {
      delete process.env["NEURODOCK_PROFILE_PATH"];
      s.cleanup();
    }
  });

  it("flags an invalid profile with violation details", async () => {
    const s = sandbox();
    try {
      writeFileSync(
        s.profile,
        "identity:\n  display_name: tester\n  neurotypes:\n    - not-a-real-neurotype\n",
      );
      process.env["NEURODOCK_PROFILE_PATH"] = s.profile;
      const r = await runDoctor();
      const schema = r.checks.find((c) => c.name === "Profile schema valid");
      expect(schema?.status).toBe("FAIL");
      expect(schema?.detail).toBeTruthy();
      expect(r.ok).toBe(false);
    } finally {
      delete process.env["NEURODOCK_PROFILE_PATH"];
      s.cleanup();
    }
  });

  it("includes Node version check", async () => {
    const r = await runDoctor();
    const node = r.checks.find((c) => c.name === "Node >= 22");
    expect(node).toBeDefined();
    // Cannot assume PASS in all sandboxes, but the check must exist and have a detail.
    expect(node?.detail).toBeTruthy();
  });
});
