import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runHostInstall,
  runHostUninstall,
  runHostVerify,
} from "../src/commands/host.js";
import { HOST_NAME } from "@neurodock/native-host/dist/registration/index.js";

function sandbox(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-host-"));
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

describe("runHostInstall (CLI wiring)", () => {
  it("stages the runtime and registers manifests whose path is the launcher, not an npx-cache cli.js", () => {
    const s = sandbox();
    try {
      // Fake source dist (stands in for @neurodock/native-host/dist).
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");

      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "data"),
        XDG_CONFIG_HOME: join(s.root, "config"),
      };

      const result = runHostInstall(
        { extensionIds: ["jjcjkmljfdebbefdemkcgknjplgkicen"] },
        {
          platform: "linux",
          home,
          env,
          sourceDistDir: sourceDist,
          nodePath: "/usr/bin/node",
        },
      );

      // The launcher exists and is what we report.
      expect(result.launcherPath).toBeTruthy();
      expect(existsSync(result.launcherPath as string)).toBe(true);

      // The Chrome manifest's `path` is the launcher, NOT a raw cli.js.
      const chromeManifest = join(
        env.XDG_CONFIG_HOME,
        "google-chrome",
        "NativeMessagingHosts",
        "com.neurodock.profile.json",
      );
      expect(existsSync(chromeManifest)).toBe(true);
      const manifest = JSON.parse(readFileSync(chromeManifest, "utf8")) as {
        path: string;
        allowed_origins: string[];
      };
      expect(manifest.path).toBe(result.launcherPath);
      expect(manifest.path).not.toMatch(/cli\.js$/);
      // Published + caller ids both present as valid chrome-extension origins.
      expect(manifest.allowed_origins).toContain(
        "chrome-extension://jjcjkmljfdebbefdemkcgknjplgkicen/",
      );
      expect(manifest.allowed_origins).toContain(
        "chrome-extension://lcdaiekokkgniiknejddojkfkoiinopo/",
      );
    } finally {
      s.cleanup();
    }
  });
});

describe("runHostUninstall (CLI wiring)", () => {
  it("accepts injectable deps and removes the staged runtime + manifests in a sandbox", () => {
    const s = sandbox();
    try {
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");

      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "data"),
        XDG_CONFIG_HOME: join(s.root, "config"),
      };

      const installed = runHostInstall(
        { extensionIds: [] },
        {
          platform: "linux",
          home,
          env,
          sourceDistDir: sourceDist,
          nodePath: "/usr/bin/node",
        },
      );
      expect(existsSync(installed.launcherPath as string)).toBe(true);

      const result = runHostUninstall({ platform: "linux", home, env });
      expect(result.platform).toBe("linux");
      // The launcher (staged runtime) is gone — no orphan.
      expect(existsSync(installed.launcherPath as string)).toBe(false);
    } finally {
      s.cleanup();
    }
  });
});

describe("runHostVerify (doctor verifies the INSTALLED launcher)", () => {
  it("PASS: reads the on-disk manifest's launcher and spawns THAT path (no re-stage)", async () => {
    const s = sandbox();
    try {
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");

      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "data"),
        XDG_CONFIG_HOME: join(s.root, "config"),
      };

      // A REAL install writes the manifest + stages the launcher.
      const installed = runHostInstall(
        { extensionIds: [] },
        {
          platform: "linux",
          home,
          env,
          sourceDistDir: sourceDist,
          nodePath: "/usr/bin/node",
        },
      );

      // Inject a fake verifier so we don't actually spawn; assert it is handed
      // the INSTALLED launcher path read from the on-disk manifest.
      let spawnedPath = "";
      const result = await runHostVerify({
        platform: "linux",
        home,
        env,
        verify: async (launcherPath: string) => {
          spawnedPath = launcherPath;
          return { ok: true, pong: true, version: "0.1.0" };
        },
      });

      expect(spawnedPath).toBe(installed.launcherPath);
      expect(result.ok).toBe(true);
      expect(result.launcherPath).toBe(installed.launcherPath);
      expect(result.version).toBe("0.1.0");
    } finally {
      s.cleanup();
    }
  });

  it("FAIL: manifest points at a non-existent (pruned _npx) launcher — does NOT re-stage, reports not-installed", async () => {
    const s = sandbox();
    try {
      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "data"),
        XDG_CONFIG_HOME: join(s.root, "config"),
      };

      // Hand-write a stale manifest pointing at an old _npx cli.js that was
      // pruned. This is the exact failure the diagnostic must catch.
      const manifestPath = join(
        env.XDG_CONFIG_HOME,
        "google-chrome",
        "NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
      mkdirSync(join(manifestPath, ".."), { recursive: true });
      const deadLauncher = join(s.root, "_npx", "deleted", "cli.js");
      writeFileSync(
        manifestPath,
        JSON.stringify({ name: HOST_NAME, path: deadLauncher, type: "stdio" }),
      );

      let verifierCalled = false;
      const result = await runHostVerify({
        platform: "linux",
        home,
        env,
        verify: async () => {
          verifierCalled = true;
          return { ok: true, pong: true, version: "0.1.0" };
        },
      });

      // Verify must NOT spawn a stale/missing launcher.
      expect(verifierCalled).toBe(false);
      expect(result.ok).toBe(false);
      expect(result.detail).toBeTruthy();
      // And it must NOT have silently re-staged a launcher to make itself pass.
      const stagedLauncher = join(
        env.XDG_DATA_HOME,
        "neurodock",
        "native-host",
        "runtime",
        `${HOST_NAME}.sh`,
      );
      expect(existsSync(stagedLauncher)).toBe(false);
    } finally {
      s.cleanup();
    }
  });

  it("FAIL: no manifest at all — reports not installed and does not install", async () => {
    const s = sandbox();
    try {
      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "data"),
        XDG_CONFIG_HOME: join(s.root, "config"),
      };
      const result = await runHostVerify({
        platform: "linux",
        home,
        env,
        verify: async () => ({ ok: true, pong: true, version: "0.1.0" }),
      });
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/install/i);
      // No manifest was written, no runtime staged.
      const manifestPath = join(
        env.XDG_CONFIG_HOME,
        "google-chrome",
        "NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
      expect(existsSync(manifestPath)).toBe(false);
    } finally {
      s.cleanup();
    }
  });
});
