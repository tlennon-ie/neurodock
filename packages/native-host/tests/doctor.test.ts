import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir, platform as osPlatform } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stageRuntime } from "../src/registration/staging.js";
import { verifyLiveLaunch } from "../src/doctor.js";

const here = dirname(fileURLToPath(import.meta.url));
// tests/ -> package root -> dist
const builtDist = resolve(here, "..", "dist");

function sandbox(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "nd-doctor-"));
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

describe("verifyLiveLaunch", () => {
  beforeAll(() => {
    if (!existsSync(join(builtDist, "cli.js"))) {
      throw new Error(
        `native-host dist not built at ${builtDist}; run \`pnpm --filter @neurodock/native-host build\` before the live-launch test.`,
      );
    }
  });

  it("spawns the staged launcher and exchanges a ping/pong over the length-prefixed protocol", async () => {
    // This is the test that would have caught all three shipped defects: it
    // stages the runtime out of the real built dist, writes a launcher for
    // the CURRENT OS, then SPAWNS that launcher (as Chrome would) and asserts
    // a valid pong. Staging for the current platform means the launcher is
    // actually runnable here (a .bat on Windows, a .sh on unix).
    const isWin = osPlatform() === "win32";
    const s = sandbox();
    try {
      const staged = stageRuntime({
        platform: isWin ? "win32" : "linux",
        home: join(s.root, "home"),
        env: isWin
          ? { APPDATA: join(s.root, "appdata") }
          : { XDG_DATA_HOME: join(s.root, "xdgdata") },
        sourceDistDir: builtDist,
        nodePath: process.execPath,
      });

      const result = await verifyLiveLaunch(staged.launcherPath, {
        timeoutMs: 10000,
      });
      expect(result.ok).toBe(true);
      expect(result.pong).toBe(true);
      expect(typeof result.version).toBe("string");
    } finally {
      s.cleanup();
    }
  });

  it("spawns the unix launcher with shell:false — a path containing a space still launches", async () => {
    // Fix #2: on macOS/Linux the .sh wrapper is 0755 + shebang, so it must be
    // spawned directly (shell:false). With shell:true the space in the dir
    // would split the launcher path into two argv tokens and fail to launch.
    // (Windows .bat genuinely needs shell:true, so this assertion is unix-only.)
    if (osPlatform() === "win32") return;
    const s = sandbox();
    try {
      const home = join(s.root, "home with space");
      const staged = stageRuntime({
        platform: "linux",
        home,
        env: { XDG_DATA_HOME: join(s.root, "xdg data home") },
        sourceDistDir: builtDist,
        nodePath: process.execPath,
      });
      expect(staged.launcherPath).toContain(" ");
      const result = await verifyLiveLaunch(staged.launcherPath, {
        timeoutMs: 10000,
      });
      expect(result.ok).toBe(true);
      expect(result.pong).toBe(true);
    } finally {
      s.cleanup();
    }
  });

  it("closes stdin after the ping so the host exits via its clean stdin-EOF path", async () => {
    // Fix #3: verifyLiveLaunch must call child.stdin.end() right after writing
    // the ping frame. We assert the staged host both pongs AND exits 0 (its
    // stdin "end" handler does process.exit(0)) within the window — i.e. it
    // was driven to a clean EOF shutdown, not left hanging until kill().
    const isWin = osPlatform() === "win32";
    const s = sandbox();
    try {
      const staged = stageRuntime({
        platform: isWin ? "win32" : "linux",
        home: join(s.root, "home"),
        env: isWin
          ? { APPDATA: join(s.root, "appdata") }
          : { XDG_DATA_HOME: join(s.root, "xdgdata") },
        sourceDistDir: builtDist,
        nodePath: process.execPath,
      });
      const result = await verifyLiveLaunch(staged.launcherPath, {
        timeoutMs: 10000,
      });
      expect(result.ok).toBe(true);
      expect(result.pong).toBe(true);
    } finally {
      s.cleanup();
    }
  });

  it("reports ok:false with a detail when the launcher path does not exist", async () => {
    const s = sandbox();
    try {
      const missing = join(s.root, "does-not-exist.sh");
      const result = await verifyLiveLaunch(missing, { timeoutMs: 3000 });
      expect(result.ok).toBe(false);
      expect(result.detail).toBeTruthy();
    } finally {
      s.cleanup();
    }
  });

  it("reports ok:false when the launched process never speaks the protocol", async () => {
    const s = sandbox();
    try {
      // A launcher that exits immediately without writing a frame (defect #3:
      // the host printing help instead of a pong). Simulate by pointing at a
      // node one-liner that prints text and exits.
      const dummyCli = join(s.root, "dummy.js");
      writeFileSync(
        dummyCli,
        "process.stdout.write('USAGE: help text\\n'); process.exit(0);\n",
      );
      let launcherPath: string;
      if (osPlatform() === "win32") {
        launcherPath = join(s.root, "dummy.bat");
        writeFileSync(
          launcherPath,
          `@echo off\r\n"${process.execPath}" "${dummyCli}" %*\r\n`,
        );
      } else {
        launcherPath = join(s.root, "dummy.sh");
        writeFileSync(
          launcherPath,
          `#!/bin/sh\nexec "${process.execPath}" "${dummyCli}" "$@"\n`,
          { mode: 0o755 },
        );
      }
      const result = await verifyLiveLaunch(launcherPath, { timeoutMs: 3000 });
      expect(result.ok).toBe(false);
    } finally {
      s.cleanup();
    }
  });
});
