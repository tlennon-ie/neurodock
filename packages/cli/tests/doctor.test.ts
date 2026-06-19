import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../src/commands/doctor.js";
import { runHostVerify } from "../src/commands/host.js";
import { HOST_NAME } from "@neurodock/native-host/dist/registration/index.js";

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

  it("exercises a LIVE native-host launch via the injected verifier (PASS path)", async () => {
    // The shipped bug was that doctor only checked files/keys exist, never a
    // live launch — so it stayed green while no Chrome connection ever
    // worked. doctor must now spawn the launcher and exchange a ping/pong.
    const s = sandbox();
    try {
      writeFileSync(
        s.profile,
        "identity:\n  display_name: tester\n  neurotypes:\n    - adhd\n",
      );
      process.env["NEURODOCK_PROFILE_PATH"] = s.profile;
      const r = await runDoctor({
        verifyNativeHost: async () => ({
          ok: true,
          launcherPath: "/stable/runtime/com.neurodock.profile.sh",
          version: "0.1.0",
        }),
      });
      const host = r.checks.find((c) => c.name === "Native host live launch");
      expect(host).toBeDefined();
      expect(host?.status).toBe("PASS");
      expect(host?.detail).toContain("0.1.0");
    } finally {
      delete process.env["NEURODOCK_PROFILE_PATH"];
      s.cleanup();
    }
  });

  it("native-host check FAILS through the REAL verifier when nothing is installed", async () => {
    // End-to-end through runHostVerify (not a hand-rolled stub): with no
    // manifest on disk, doctor must report the host as not installed and FAIL
    // — it must NOT silently install to make itself pass.
    const s = sandbox();
    try {
      writeFileSync(
        s.profile,
        "identity:\n  display_name: tester\n  neurotypes:\n    - adhd\n",
      );
      process.env["NEURODOCK_PROFILE_PATH"] = s.profile;
      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "data"),
        XDG_CONFIG_HOME: join(s.root, "config"),
      };
      const r = await runDoctor({
        verifyNativeHost: () => runHostVerify({ platform: "linux", home, env }),
      });
      const host = r.checks.find((c) => c.name === "Native host live launch");
      expect(host?.status).toBe("FAIL");
      expect(host?.detail).toMatch(/install/i);
      expect(r.ok).toBe(false);
    } finally {
      delete process.env["NEURODOCK_PROFILE_PATH"];
      s.cleanup();
    }
  });

  it("native-host check FAILS through the REAL verifier when the installed manifest points at a missing launcher", async () => {
    const s = sandbox();
    try {
      writeFileSync(
        s.profile,
        "identity:\n  display_name: tester\n  neurotypes:\n    - adhd\n",
      );
      process.env["NEURODOCK_PROFILE_PATH"] = s.profile;
      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "data"),
        XDG_CONFIG_HOME: join(s.root, "config"),
      };
      // A stale manifest pointing at a launcher that no longer exists (the
      // pruned-_npx scenario the diagnostic exists to catch).
      const manifestPath = join(
        env.XDG_CONFIG_HOME,
        "google-chrome",
        "NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
      mkdirSync(join(manifestPath, ".."), { recursive: true });
      writeFileSync(
        manifestPath,
        JSON.stringify({
          name: HOST_NAME,
          path: join(s.root, "gone", "cli.js"),
          type: "stdio",
        }),
      );
      const r = await runDoctor({
        verifyNativeHost: () => runHostVerify({ platform: "linux", home, env }),
      });
      const host = r.checks.find((c) => c.name === "Native host live launch");
      expect(host?.status).toBe("FAIL");
      expect(host?.detail).toMatch(/install/i);
      expect(r.ok).toBe(false);
    } finally {
      delete process.env["NEURODOCK_PROFILE_PATH"];
      s.cleanup();
    }
  });

  it("fails doctor when the live native-host launch does not respond", async () => {
    const s = sandbox();
    try {
      writeFileSync(
        s.profile,
        "identity:\n  display_name: tester\n  neurotypes:\n    - adhd\n",
      );
      process.env["NEURODOCK_PROFILE_PATH"] = s.profile;
      const r = await runDoctor({
        verifyNativeHost: async () => ({
          ok: false,
          launcherPath: "/stable/runtime/com.neurodock.profile.sh",
          version: null,
          detail: "Host exited (code 1) without a valid response.",
        }),
      });
      const host = r.checks.find((c) => c.name === "Native host live launch");
      expect(host?.status).toBe("FAIL");
      expect(host?.detail).toContain("code 1");
      expect(r.ok).toBe(false);
    } finally {
      delete process.env["NEURODOCK_PROFILE_PATH"];
      s.cleanup();
    }
  });
});
