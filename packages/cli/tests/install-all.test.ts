import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runInstallAll,
  type SpawnFn,
  type SpawnResult,
} from "../src/commands/install-all.js";

function makeSandbox(): { home: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-installall-"));
  const home = join(root, "home");
  const cwd = join(root, "cwd");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  return {
    home,
    cwd,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

interface SpawnLogEntry {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

interface FakeSpawnOptions {
  readonly uvAvailable?: boolean;
  readonly pipAvailable?: boolean;
  readonly installSucceeds?: boolean;
  readonly entrypointsOnPath?: boolean;
}

function makeFakeSpawn(opts: FakeSpawnOptions = {}): {
  spawn: SpawnFn;
  calls: SpawnLogEntry[];
} {
  const uvAvailable = opts.uvAvailable ?? false;
  const pipAvailable = opts.pipAvailable ?? false;
  const installSucceeds = opts.installSucceeds ?? true;
  const entrypointsOnPath = opts.entrypointsOnPath ?? true;
  const calls: SpawnLogEntry[] = [];

  const ok: SpawnResult = { status: 0, stdout: "ok\n", stderr: "" };
  const notFound: SpawnResult = {
    status: null,
    stdout: "",
    stderr: "",
    error: Object.assign(new Error("ENOENT"), {
      code: "ENOENT",
    }) as NodeJS.ErrnoException,
  };
  const failNonZero: SpawnResult = {
    status: 1,
    stdout: "",
    stderr: "install failed\n",
  };

  const spawn: SpawnFn = (command, args) => {
    calls.push({ command, args: [...args] });
    if (command === "uv" && args[0] === "--version") {
      return uvAvailable ? ok : notFound;
    }
    if (
      (command === "python" || command === "python3") &&
      args[0] === "-m" &&
      args[1] === "pip" &&
      args[2] === "--version"
    ) {
      return pipAvailable ? ok : notFound;
    }
    if (command === "uv" && args[0] === "tool" && args[1] === "install") {
      return installSucceeds ? ok : failNonZero;
    }
    if (
      (command === "python" || command === "python3") &&
      args[0] === "-m" &&
      args[1] === "pip" &&
      args[2] === "install"
    ) {
      return installSucceeds ? ok : failNonZero;
    }
    // Treat "neurodock-mcp-*" --help as the PATH probe.
    if (args.length === 1 && args[0] === "--help") {
      return entrypointsOnPath ? ok : notFound;
    }
    return notFound;
  };
  return { spawn, calls };
}

describe("neurodock install-all", () => {
  let sandbox: ReturnType<typeof makeSandbox>;

  beforeEach(() => {
    sandbox = makeSandbox();
    // Seed a Claude Code project config so init has somewhere to act.
    writeFileSync(
      join(sandbox.cwd, ".mcp.json"),
      JSON.stringify({ mcpServers: {} }, null, 2),
    );
  });

  afterEach(() => sandbox.cleanup());

  it("--dry-run writes nothing and prints the planned install list", async () => {
    const { spawn, calls } = makeFakeSpawn({ uvAvailable: true });
    const profileFile = join(sandbox.home, "profile.yaml");

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: true,
        noNativeHost: true,
      },
      {
        spawn,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: { NEURODOCK_PROFILE_PATH: profileFile } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.exitCode).toBe(0);
    expect(r.installer).toBe("dry-run");
    expect(r.packages).toHaveLength(0);
    expect(r.initResult).toBeNull();
    expect(r.messages.join("\n")).toContain("Dry run");
    expect(r.messages.join("\n")).toContain("neurodock-mcp-chronometric");
    // No install or PATH calls should have run beyond the installer probe.
    const installCalls = calls.filter(
      (c) =>
        (c.command === "uv" &&
          c.args[0] === "tool" &&
          c.args[1] === "install") ||
        (c.command.startsWith("python") &&
          c.args[0] === "-m" &&
          c.args[1] === "pip" &&
          c.args[2] === "install"),
    );
    expect(installCalls).toHaveLength(0);
    // Profile and client config left untouched.
    expect(existsSync(profileFile)).toBe(false);
    const cfgText = readFileSync(join(sandbox.cwd, ".mcp.json"), "utf8");
    expect(cfgText).toBe(JSON.stringify({ mcpServers: {} }, null, 2));
  });

  it("prefers uv when available", async () => {
    const { spawn, calls } = makeFakeSpawn({
      uvAvailable: true,
      pipAvailable: true,
    });

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: true,
      },
      {
        spawn,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.installer).toBe("uv");
    expect(r.exitCode).toBe(0);
    const uvInstallCalls = calls.filter(
      (c) =>
        c.command === "uv" && c.args[0] === "tool" && c.args[1] === "install",
    );
    expect(uvInstallCalls).toHaveLength(6);
    expect(uvInstallCalls.map((c) => c.args[2])).toEqual([
      "neurodock-mcp-chronometric",
      "neurodock-mcp-cognitive-graph",
      "neurodock-mcp-task-fractionator",
      "neurodock-mcp-translation",
      "neurodock-mcp-guardrail",
      "neurodock-evals",
    ]);
    expect(r.packages).toHaveLength(6);
    expect(r.packages.every((p) => p.installed && p.onPath)).toBe(true);
  });

  it("falls back to pip when uv is missing", async () => {
    const { spawn, calls } = makeFakeSpawn({
      uvAvailable: false,
      pipAvailable: true,
    });

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: true,
      },
      {
        spawn,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.installer).toBe("pip");
    expect(r.exitCode).toBe(0);
    const pipInstallCalls = calls.filter(
      (c) =>
        c.command.startsWith("python") &&
        c.args[0] === "-m" &&
        c.args[1] === "pip" &&
        c.args[2] === "install",
    );
    expect(pipInstallCalls).toHaveLength(6);
    const uvInstallCalls = calls.filter(
      (c) =>
        c.command === "uv" && c.args[0] === "tool" && c.args[1] === "install",
    );
    expect(uvInstallCalls).toHaveLength(0);
  });

  it("--skip-install bypasses install but still runs init", async () => {
    const { spawn, calls } = makeFakeSpawn({ uvAvailable: true });

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: true,
        yes: true,
        dryRun: false,
        noNativeHost: true,
      },
      {
        spawn,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.installer).toBe("skipped");
    const installCalls = calls.filter(
      (c) =>
        (c.command === "uv" &&
          c.args[0] === "tool" &&
          c.args[1] === "install") ||
        (c.command.startsWith("python") &&
          c.args[0] === "-m" &&
          c.args[1] === "pip" &&
          c.args[2] === "install"),
    );
    expect(installCalls).toHaveLength(0);
    // Init still ran — profile + client config should exist.
    expect(r.initResult).not.toBeNull();
    expect(existsSync(join(sandbox.home, "profile.yaml"))).toBe(true);
    expect(r.messages.join("\n")).toContain("Try one of these");
  });

  it("returns exit code 1 when entrypoints are not on PATH after install", async () => {
    const { spawn } = makeFakeSpawn({
      uvAvailable: true,
      installSucceeds: true,
      entrypointsOnPath: false,
    });

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: true,
      },
      {
        spawn,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.exitCode).toBe(1);
    expect(r.packages.every((p) => p.installed)).toBe(true);
    expect(r.packages.every((p) => !p.onPath)).toBe(true);
    expect(r.messages.some((m) => m.includes("[warn]"))).toBe(true);
  });

  it("prints a summary and suggested prompts at the end", async () => {
    const { spawn } = makeFakeSpawn({ uvAvailable: true });

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: true,
      },
      {
        spawn,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    const joined = r.messages.join("\n");
    expect(joined).toMatch(/Summary: 6\/6 installed, 6\/6 on PATH/);
    expect(joined).toContain("Try one of these");
    expect(joined).toContain("neurodock examples");
  });

  it("--installer uv fails fast when uv is missing", async () => {
    const { spawn } = makeFakeSpawn({ uvAvailable: false, pipAvailable: true });

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "uv",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: true,
      },
      {
        spawn,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.exitCode).toBe(1);
    expect(r.installer).toBe("skipped");
    expect(r.packages).toHaveLength(0);
    expect(r.messages.join("\n")).toContain("Could not find an installer");
  });

  it("happy path: install-all also runs the native-host install", async () => {
    const { spawn } = makeFakeSpawn({ uvAvailable: true });
    let hostInstallCalls = 0;
    const fakeHostInstall = (): {
      platform: string;
      outcomes: ReadonlyArray<{
        browser: string;
        manifestPath: string;
        action: "create" | "skip" | "update" | "remove";
        detail?: string;
      }>;
    } => {
      hostInstallCalls += 1;
      return {
        platform: "linux",
        outcomes: [
          {
            browser: "chrome",
            manifestPath: "/fake/chrome/com.neurodock.profile.json",
            action: "create",
          },
        ],
      };
    };

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: false,
      },
      {
        spawn,
        runHostInstall: fakeHostInstall,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(hostInstallCalls).toBe(1);
    expect(r.nativeHost.status).toBe("installed");
    expect(r.exitCode).toBe(0);
    const joined = r.messages.join("\n");
    expect(joined).toContain("Installing native-messaging host");
    expect(joined).toContain("chrome");
    expect(joined).toContain("Installed the native-messaging host");
    expect(joined).toContain("What this just did:");
  });

  it("--no-native-host skips the native-host install", async () => {
    const { spawn } = makeFakeSpawn({ uvAvailable: true });
    let hostInstallCalls = 0;
    const fakeHostInstall = (): {
      platform: string;
      outcomes: ReadonlyArray<{
        browser: string;
        manifestPath: string;
        action: "create" | "skip" | "update" | "remove";
        detail?: string;
      }>;
    } => {
      hostInstallCalls += 1;
      return { platform: "linux", outcomes: [] };
    };

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: true,
      },
      {
        spawn,
        runHostInstall: fakeHostInstall,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(hostInstallCalls).toBe(0);
    expect(r.nativeHost.status).toBe("skipped");
    expect(r.exitCode).toBe(0);
    const joined = r.messages.join("\n");
    expect(joined).toContain("Skipping native-messaging host install");
    expect(joined).toContain("--no-native-host");
    expect(joined).toContain("Skipped the native-messaging host");
  });

  it("native-host failure emits a warning but does not fail the whole command", async () => {
    const { spawn } = makeFakeSpawn({ uvAvailable: true });
    const fakeHostInstall = (): {
      platform: string;
      outcomes: ReadonlyArray<{
        browser: string;
        manifestPath: string;
        action: "create" | "skip" | "update" | "remove";
        detail?: string;
      }>;
    } => {
      throw new Error("permission denied writing registry key");
    };

    const r = await runInstallAll(
      {
        client: "claude-code",
        profile: "minimal",
        installer: "auto",
        skipInstall: false,
        yes: true,
        dryRun: false,
        noNativeHost: false,
      },
      {
        spawn,
        runHostInstall: fakeHostInstall,
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {
            NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml"),
          } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.nativeHost.status).toBe("failed");
    expect(r.nativeHost.error).toContain("permission denied");
    // Whole command stays exit 0 — six MCP servers installed fine; the host
    // is optional.
    expect(r.exitCode).toBe(0);
    const joined = r.messages.join("\n");
    expect(joined).toContain("[warn]");
    expect(joined).toContain("native-messaging host install failed");
    expect(joined).toContain("optional");
    expect(joined).toContain("Native-messaging host install failed");
  });
});
