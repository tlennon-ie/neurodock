import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chromiumManifestPath,
  resolveInstalledLauncher,
} from "../src/registration/staging.js";
import { HOST_NAME } from "../src/registration/types.js";

function sandbox(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "nd-installed-"));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

describe("chromiumManifestPath", () => {
  it("Windows: %APPDATA%\\NeuroDock\\native-host\\com.neurodock.profile.json", () => {
    const p = chromiumManifestPath("win32", "C:\\Users\\me", {
      APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    });
    expect(p).toContain("NeuroDock");
    expect(p).toContain("native-host");
    expect(p).toContain(`${HOST_NAME}.json`);
    expect(p).toContain("Roaming");
  });

  it("macOS: under Google/Chrome/NativeMessagingHosts", () => {
    const p = chromiumManifestPath("darwin", "/Users/me", {});
    expect(p).toContain("Library");
    expect(p).toContain("Application Support");
    expect(p).toContain("Google");
    expect(p).toContain("Chrome");
    expect(p).toContain("NativeMessagingHosts");
    expect(p).toContain(`${HOST_NAME}.json`);
  });

  it("Linux: honours $XDG_CONFIG_HOME under google-chrome/NativeMessagingHosts", () => {
    const p = chromiumManifestPath("linux", "/home/me", {
      XDG_CONFIG_HOME: "/home/me/.xdgconfig",
    });
    expect(p).toContain(".xdgconfig");
    expect(p).toContain("google-chrome");
    expect(p).toContain("NativeMessagingHosts");
    expect(p).toContain(`${HOST_NAME}.json`);
  });

  it("Linux: falls back to ~/.config when XDG_CONFIG_HOME unset", () => {
    const p = chromiumManifestPath("linux", "/home/me", {});
    expect(p).toContain(".config");
    expect(p).toContain("google-chrome");
  });
});

describe("resolveInstalledLauncher", () => {
  it("reads the on-disk chromium manifest and returns its `path` when the launcher exists", () => {
    const s = sandbox();
    try {
      const home = join(s.root, "home");
      const env = { XDG_CONFIG_HOME: join(s.root, "config") };
      // Stage a launcher file on disk and a manifest pointing at it.
      const launcher = join(s.root, "runtime", `${HOST_NAME}.sh`);
      mkdirSync(join(s.root, "runtime"), { recursive: true });
      writeFileSync(launcher, "#!/bin/sh\nexec node\n", { mode: 0o755 });

      const manifestPath = chromiumManifestPath("linux", home, env);
      mkdirSync(join(manifestPath, ".."), { recursive: true });
      writeFileSync(
        manifestPath,
        JSON.stringify({ name: HOST_NAME, path: launcher, type: "stdio" }),
      );

      const r = resolveInstalledLauncher("linux", home, env);
      expect(r.ok).toBe(true);
      expect(r.launcherPath).toBe(launcher);
      expect(r.manifestPath).toBe(manifestPath);
    } finally {
      s.cleanup();
    }
  });

  it("FAILS when the manifest is missing (not installed)", () => {
    const s = sandbox();
    try {
      const home = join(s.root, "home");
      const env = { XDG_CONFIG_HOME: join(s.root, "config") };
      const r = resolveInstalledLauncher("linux", home, env);
      expect(r.ok).toBe(false);
      expect(r.detail).toBeTruthy();
      // Clear, actionable message that points the user at install.
      expect(r.detail).toMatch(/install/i);
    } finally {
      s.cleanup();
    }
  });

  it("FAILS when the manifest exists but its `path` does not exist on disk (stale/pruned launcher)", () => {
    const s = sandbox();
    try {
      const home = join(s.root, "home");
      const env = { XDG_CONFIG_HOME: join(s.root, "config") };
      const manifestPath = chromiumManifestPath("linux", home, env);
      mkdirSync(join(manifestPath, ".."), { recursive: true });
      // Point at an old _npx cache file that no longer exists.
      writeFileSync(
        manifestPath,
        JSON.stringify({
          name: HOST_NAME,
          path: join(s.root, "_npx", "deleted", "cli.js"),
          type: "stdio",
        }),
      );

      const r = resolveInstalledLauncher("linux", home, env);
      expect(r.ok).toBe(false);
      expect(r.launcherPath).toBe(join(s.root, "_npx", "deleted", "cli.js"));
      expect(r.detail).toBeTruthy();
      expect(r.detail).toMatch(/install/i);
    } finally {
      s.cleanup();
    }
  });

  it("FAILS with a clear message when the manifest is unreadable JSON", () => {
    const s = sandbox();
    try {
      const home = join(s.root, "home");
      const env = { XDG_CONFIG_HOME: join(s.root, "config") };
      const manifestPath = chromiumManifestPath("linux", home, env);
      mkdirSync(join(manifestPath, ".."), { recursive: true });
      writeFileSync(manifestPath, "{ this is not json");

      const r = resolveInstalledLauncher("linux", home, env);
      expect(r.ok).toBe(false);
      expect(r.detail).toBeTruthy();
    } finally {
      s.cleanup();
    }
  });
});
