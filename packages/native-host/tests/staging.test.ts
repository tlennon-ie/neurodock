import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir, platform as osPlatform } from "node:os";
import { join } from "node:path";
import {
  stableRuntimeDir,
  launcherFileName,
  buildLauncherContent,
  stageRuntime,
} from "../src/registration/staging.js";

function sandbox(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "nd-staging-"));
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

describe("stableRuntimeDir", () => {
  it("Windows: places runtime under %APPDATA%\\NeuroDock\\native-host\\runtime", () => {
    const dir = stableRuntimeDir("win32", "C:\\Users\\me", {
      APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    });
    // Path separators are normalised by node:path on the host OS; assert the
    // segments are present and stable rather than the literal separator.
    expect(dir).toContain("NeuroDock");
    expect(dir).toContain("native-host");
    expect(dir).toContain("runtime");
    expect(dir).toContain("Roaming");
  });

  it("Windows: falls back to home\\AppData\\Roaming when APPDATA unset", () => {
    const dir = stableRuntimeDir("win32", "C:\\Users\\me", {});
    expect(dir).toContain("AppData");
    expect(dir).toContain("Roaming");
    expect(dir).toContain("runtime");
  });

  it("macOS: places runtime under ~/Library/Application Support/NeuroDock/native-host/runtime", () => {
    const dir = stableRuntimeDir("darwin", "/Users/me", {});
    expect(dir).toContain("Library");
    expect(dir).toContain("Application Support");
    expect(dir).toContain("NeuroDock");
    expect(dir).toContain("native-host");
    expect(dir).toContain("runtime");
  });

  it("Linux: honours $XDG_DATA_HOME when set", () => {
    const dir = stableRuntimeDir("linux", "/home/me", {
      XDG_DATA_HOME: "/home/me/.xdgdata",
    });
    expect(dir).toContain(".xdgdata");
    expect(dir).toContain("neurodock");
    expect(dir).toContain("native-host");
    expect(dir).toContain("runtime");
  });

  it("Linux: falls back to ~/.local/share when XDG_DATA_HOME unset", () => {
    const dir = stableRuntimeDir("linux", "/home/me", {});
    expect(dir).toContain(".local");
    expect(dir).toContain("share");
    expect(dir).toContain("neurodock");
    expect(dir).toContain("runtime");
  });
});

describe("launcherFileName", () => {
  it("is a .bat on Windows", () => {
    expect(launcherFileName("win32")).toBe("com.neurodock.profile.bat");
  });
  it("is a .sh on macOS / Linux", () => {
    expect(launcherFileName("darwin")).toBe("com.neurodock.profile.sh");
    expect(launcherFileName("linux")).toBe("com.neurodock.profile.sh");
  });
});

describe("buildLauncherContent", () => {
  it("Windows .bat invokes the embedded node.exe with the staged cli.js and forces 'run' before %*", () => {
    const content = buildLauncherContent(
      "win32",
      "C:\\Program Files\\nodejs\\node.exe",
      "C:\\Users\\me\\AppData\\Roaming\\NeuroDock\\native-host\\runtime\\cli.js",
    );
    // node + cli are quoted (paths can contain spaces).
    expect(content).toContain('"C:\\Program Files\\nodejs\\node.exe"');
    expect(content).toContain(
      '"C:\\Users\\me\\AppData\\Roaming\\NeuroDock\\native-host\\runtime\\cli.js"',
    );
    // `run` precedes the forwarded args so Chrome's origin arg arrives after.
    expect(content).toMatch(/run\s+%\*/);
    // The order must be node, then cli.js, then the run subcommand, then %*.
    // Match ` run ` with surrounding whitespace so the "run" inside the
    // "runtime" path segment is not mistaken for the subcommand.
    const nodeIdx = content.indexOf("node.exe");
    const cliIdx = content.indexOf("cli.js");
    const runIdx = content.search(/\srun\s/);
    const argsIdx = content.indexOf("%*");
    expect(nodeIdx).toBeLessThan(cliIdx);
    expect(cliIdx).toBeLessThan(runIdx);
    expect(runIdx).toBeLessThan(argsIdx);
  });

  it("unix wrapper has a shebang, exec's the embedded node + staged cli.js, forces 'run', and forwards \"$@\"", () => {
    const content = buildLauncherContent(
      "linux",
      "/usr/bin/node",
      "/home/me/.local/share/neurodock/native-host/runtime/cli.js",
    );
    expect(content.startsWith("#!/bin/sh")).toBe(true);
    expect(content).toContain('exec "/usr/bin/node"');
    expect(content).toContain(
      '"/home/me/.local/share/neurodock/native-host/runtime/cli.js"',
    );
    expect(content).toMatch(/run\s+"\$@"/);
    const nodeIdx = content.indexOf("/usr/bin/node");
    const cliIdx = content.indexOf("cli.js");
    const runIdx = content.indexOf(" run ");
    const argsIdx = content.indexOf('"$@"');
    expect(nodeIdx).toBeLessThan(cliIdx);
    expect(cliIdx).toBeLessThan(runIdx);
    expect(runIdx).toBeLessThan(argsIdx);
  });
});

describe("stageRuntime", () => {
  it("copies the source dist tree into the stable runtime dir and writes the launcher pointing at the staged cli.js", () => {
    const s = sandbox();
    try {
      // Arrange: a fake source dist with cli.js + a nested file.
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(join(sourceDist, "registration"), { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// staged cli\n");
      writeFileSync(join(sourceDist, "index.js"), "// staged index\n");
      writeFileSync(
        join(sourceDist, "registration", "index.js"),
        "// nested\n",
      );

      const home = join(s.root, "home");
      // Point the stable dir resolution into the sandbox via env/home.
      const result = stageRuntime({
        platform: "linux",
        home,
        env: { XDG_DATA_HOME: join(s.root, "xdgdata") },
        sourceDistDir: sourceDist,
        nodePath: "/usr/bin/node",
      });

      // The staged cli.js must exist and match source.
      const stagedCli = join(result.runtimeDir, "cli.js");
      expect(existsSync(stagedCli)).toBe(true);
      expect(readFileSync(stagedCli, "utf8")).toBe("// staged cli\n");
      // Nested files copied too.
      expect(
        existsSync(join(result.runtimeDir, "registration", "index.js")),
      ).toBe(true);

      // Launcher written, points at staged cli.js, and result.launcherPath matches.
      expect(existsSync(result.launcherPath)).toBe(true);
      const launcher = readFileSync(result.launcherPath, "utf8");
      expect(launcher).toContain(stagedCli);
      expect(launcher).toContain("/usr/bin/node");
      expect(launcher).toMatch(/run\s+"\$@"/);
    } finally {
      s.cleanup();
    }
  });

  it("is idempotent: a second stageRuntime overwrites the staged files", () => {
    const s = sandbox();
    try {
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// v1\n");

      const home = join(s.root, "home");
      const env = { XDG_DATA_HOME: join(s.root, "xdgdata") };
      const first = stageRuntime({
        platform: "linux",
        home,
        env,
        sourceDistDir: sourceDist,
        nodePath: "/usr/bin/node",
      });
      expect(readFileSync(join(first.runtimeDir, "cli.js"), "utf8")).toBe(
        "// v1\n",
      );

      // Re-stage with updated source.
      writeFileSync(join(sourceDist, "cli.js"), "// v2\n");
      const second = stageRuntime({
        platform: "linux",
        home,
        env,
        sourceDistDir: sourceDist,
        nodePath: "/usr/bin/node",
      });
      expect(second.runtimeDir).toBe(first.runtimeDir);
      expect(readFileSync(join(second.runtimeDir, "cli.js"), "utf8")).toBe(
        "// v2\n",
      );
    } finally {
      s.cleanup();
    }
  });

  it("refuses to stage when the resolved runtime dir contains a double-quote (hostile XDG_DATA_HOME)", () => {
    const s = sandbox();
    try {
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");
      // A data root with a double-quote would land inside the launcher's
      // quoted "<path>" and break out of it. Fail fast.
      expect(() =>
        stageRuntime({
          platform: "linux",
          home: join(s.root, "home"),
          env: { XDG_DATA_HOME: `${s.root}/ev"il` },
          sourceDistDir: sourceDist,
          nodePath: "/usr/bin/node",
        }),
      ).toThrow(/unsafe character/i);
    } finally {
      s.cleanup();
    }
  });

  it("refuses to stage when the resolved runtime dir contains a control character (newline)", () => {
    const s = sandbox();
    try {
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");
      expect(() =>
        stageRuntime({
          platform: "linux",
          home: join(s.root, "home"),
          env: { XDG_DATA_HOME: `${s.root}/ev\nil` },
          sourceDistDir: sourceDist,
          nodePath: "/usr/bin/node",
        }),
      ).toThrow(/unsafe character/i);
    } finally {
      s.cleanup();
    }
  });

  it("makes the unix launcher executable (mode 0755)", () => {
    // Windows filesystems do not honour POSIX mode bits, so this assertion
    // is only meaningful on a unix host (where CI runs the unix branch).
    if (osPlatform() === "win32") return;
    const s = sandbox();
    try {
      const sourceDist = join(s.root, "src-dist");
      mkdirSync(sourceDist, { recursive: true });
      writeFileSync(join(sourceDist, "cli.js"), "// cli\n");
      const result = stageRuntime({
        platform: "linux",
        home: join(s.root, "home"),
        env: { XDG_DATA_HOME: join(s.root, "xdgdata") },
        sourceDistDir: sourceDist,
        nodePath: "/usr/bin/node",
      });
      const mode = statSync(result.launcherPath).mode & 0o777;
      expect(mode & 0o100).toBe(0o100);
    } finally {
      s.cleanup();
    }
  });
});
