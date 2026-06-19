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
  registerWithStaging,
  unregisterWithStaging,
} from "../src/registration/index.js";
import { HOST_NAME } from "../src/registration/types.js";

function sandbox(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "nd-regstage-"));
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

describe("registerWithStaging (Linux)", () => {
  it("stages the runtime then writes manifests whose `path` is the staged launcher, not the raw cli.js", () => {
    const s = sandbox();
    try {
      // Arrange: a fake source dist.
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");

      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "xdgdata"),
        XDG_CONFIG_HOME: join(s.root, "xdgconfig"),
      };

      // Act
      const result = registerWithStaging({
        platform: "linux",
        home,
        env,
        sourceDistDir: sourceDist,
        nodePath: "/usr/bin/node",
        allowedExtensionIds: ["lcdaiekokkgniiknejddojkfkoiinopo"],
      });

      // Launcher staged.
      expect(existsSync(result.launcherPath)).toBe(true);
      expect(result.launcherPath).toMatch(/\.sh$/);

      // A Chrome manifest was written and its `path` is the launcher.
      const chromeManifestPath = join(
        env.XDG_CONFIG_HOME,
        "google-chrome",
        "NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
      expect(existsSync(chromeManifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(chromeManifestPath, "utf8")) as {
        path: string;
        allowed_origins: string[];
      };
      expect(manifest.path).toBe(result.launcherPath);
      expect(manifest.path).not.toMatch(/cli\.js$/);
      // allowed_origins carries the valid chrome id as a chrome-extension origin.
      expect(manifest.allowed_origins).toContain(
        "chrome-extension://lcdaiekokkgniiknejddojkfkoiinopo/",
      );

      // Firefox manifest also points at the launcher.
      const firefoxManifestPath = join(
        home,
        ".mozilla",
        "native-messaging-hosts",
        `${HOST_NAME}.json`,
      );
      expect(existsSync(firefoxManifestPath)).toBe(true);
      const ff = JSON.parse(readFileSync(firefoxManifestPath, "utf8")) as {
        path: string;
      };
      expect(ff.path).toBe(result.launcherPath);
    } finally {
      s.cleanup();
    }
  });

  it("unregisterWithStaging removes the staged runtime dir (no orphans)", () => {
    const s = sandbox();
    try {
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");

      const home = join(s.root, "home");
      const env = {
        XDG_DATA_HOME: join(s.root, "xdgdata"),
        XDG_CONFIG_HOME: join(s.root, "xdgconfig"),
      };

      const installed = registerWithStaging({
        platform: "linux",
        home,
        env,
        sourceDistDir: sourceDist,
        nodePath: "/usr/bin/node",
        allowedExtensionIds: ["abc"],
      });
      expect(existsSync(installed.runtimeDir)).toBe(true);
      expect(existsSync(installed.launcherPath)).toBe(true);

      unregisterWithStaging({ platform: "linux", home, env });

      // The staged runtime tree is gone — no dangling launcher / bundle.
      expect(existsSync(installed.runtimeDir)).toBe(false);
      // And the manifests it pointed at are removed too.
      const chromeManifestPath = join(
        env.XDG_CONFIG_HOME,
        "google-chrome",
        "NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
      expect(existsSync(chromeManifestPath)).toBe(false);
    } finally {
      s.cleanup();
    }
  });
});
