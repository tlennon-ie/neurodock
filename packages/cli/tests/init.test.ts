import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../src/commands/init.js";

function makeSandbox(): { home: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-cli-"));
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

describe("neurodock init", () => {
  let sandbox: ReturnType<typeof makeSandbox>;

  beforeEach(() => {
    sandbox = makeSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("dry-run prints diff and writes nothing", async () => {
    // Seed a Claude Code project config so init has somewhere to act.
    const claudeDir = join(sandbox.cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const claudeCfg = join(sandbox.cwd, ".mcp.json");
    writeFileSync(claudeCfg, JSON.stringify({ mcpServers: {} }, null, 2));

    const result = await runInit(
      { client: "claude-code", profile: "minimal", dryRun: true, yes: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: { NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml") } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(result.applied).toBe(false);
    expect(result.messages.join("\n")).toContain("Dry run");
    // Profile not written.
    expect(existsSync(join(sandbox.home, "profile.yaml"))).toBe(false);
    // Client config untouched.
    const text = readFileSync(claudeCfg, "utf8");
    expect(text).toBe(JSON.stringify({ mcpServers: {} }, null, 2));
    // Diff names at least the chronometric server.
    expect(result.diff.clients.length).toBeGreaterThan(0);
    const added = result.diff.clients.flatMap((c) => c.added);
    expect(added).toContain("neurodock-chronometric");
  });

  it("creates a profile from the minimal template using $USER as display_name", async () => {
    const claudeDir = join(sandbox.cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(sandbox.cwd, ".mcp.json"), JSON.stringify({ mcpServers: {} }, null, 2));

    const profileFile = join(sandbox.home, "profile.yaml");
    const result = await runInit(
      { client: "claude-code", profile: "minimal", dryRun: false, yes: true },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "alice",
          env: { NEURODOCK_PROFILE_PATH: profileFile, USER: "alice" } as NodeJS.ProcessEnv,
        },
      },
    );

    expect(result.applied).toBe(true);
    expect(existsSync(profileFile)).toBe(true);
    const yamlText = readFileSync(profileFile, "utf8");
    expect(yamlText).toContain("display_name");
    expect(yamlText).toContain("alice");
  });

  it("preserves existing mcpServers entries when wiring", async () => {
    const claudeDir = join(sandbox.cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const claudeCfg = join(sandbox.cwd, ".mcp.json");
    const existing = {
      mcpServers: {
        "third-party": { command: "node", args: ["server.js"] },
      },
      unrelatedKey: "keep me",
    };
    writeFileSync(claudeCfg, JSON.stringify(existing, null, 2));

    await runInit(
      { client: "claude-code", profile: "minimal", dryRun: false, yes: true },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: { NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml") } as NodeJS.ProcessEnv,
        },
      },
    );

    const written = JSON.parse(readFileSync(claudeCfg, "utf8")) as {
      mcpServers: Record<string, unknown>;
      unrelatedKey: string;
    };
    expect(written.unrelatedKey).toBe("keep me");
    expect(written.mcpServers["third-party"]).toBeDefined();
    expect(written.mcpServers["neurodock-chronometric"]).toBeDefined();
    expect(written.mcpServers["neurodock-cognitive-graph"]).toBeDefined();
    expect(written.mcpServers["neurodock-task-fractionator"]).toBeDefined();
  });

  it("is idempotent: a second run reports no-change", async () => {
    const claudeDir = join(sandbox.cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(sandbox.cwd, ".mcp.json"), JSON.stringify({ mcpServers: {} }, null, 2));

    const opts = { client: "claude-code" as const, profile: "minimal" as const, dryRun: false, yes: true };
    const deps = {
      envOverrides: {
        platform: "linux" as const,
        home: sandbox.home,
        cwd: sandbox.cwd,
        user: "tester",
        env: { NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml") } as NodeJS.ProcessEnv,
      },
    };
    await runInit(opts, deps);
    const second = await runInit(opts, deps);
    const actions = second.diff.clients.map((c) => c.action);
    expect(actions).toContain("no-change");
  });

  it("exits cleanly with a 'no client detected' message when run in 'all' mode with nothing present", async () => {
    const result = await runInit(
      { client: "all", profile: "minimal", dryRun: false, yes: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: { NEURODOCK_PROFILE_PATH: join(sandbox.home, "profile.yaml") } as NodeJS.ProcessEnv,
        },
      },
    );
    expect(result.applied).toBe(false);
    expect(result.messages.join("\n")).toContain("No supported MCP client detected");
  });
});
