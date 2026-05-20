import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExamples } from "../src/commands/examples.js";

function makeSandbox(): { home: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-examples-"));
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

function writeClaudeCodeConfig(
  cwd: string,
  servers: Record<string, unknown>,
): void {
  const path = join(cwd, ".mcp.json");
  writeFileSync(path, JSON.stringify({ mcpServers: servers }, null, 2));
}

describe("neurodock examples", () => {
  let sandbox: ReturnType<typeof makeSandbox>;

  beforeEach(() => {
    sandbox = makeSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("prints prompts for each wired server", async () => {
    writeClaudeCodeConfig(sandbox.cwd, {
      "neurodock-chronometric": { command: "neurodock-mcp-chronometric" },
      "neurodock-cognitive-graph": { command: "neurodock-mcp-cognitive-graph" },
      "neurodock-task-fractionator": {
        command: "neurodock-mcp-task-fractionator",
      },
    });

    const r = await runExamples(
      { json: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
        colorEnabled: () => false,
      },
    );

    expect(r.wired).toContain("neurodock-chronometric");
    expect(r.wired).toContain("neurodock-cognitive-graph");
    expect(r.wired).toContain("neurodock-task-fractionator");
    expect(r.groups).toHaveLength(3);
    const text = r.messages.join("\n");
    expect(text).toContain("What time is it and what's my energy zone?");
    expect(text).toContain("→ get_time_context");
    expect(text).toContain("Decompose this goal");
    expect(text).toContain("→ decompose");
  });

  it("shows no prompts when no servers are wired", async () => {
    // Write a config with only unrelated servers.
    writeClaudeCodeConfig(sandbox.cwd, {
      "third-party": { command: "node", args: ["server.js"] },
    });

    const r = await runExamples(
      { json: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
        colorEnabled: () => false,
      },
    );

    expect(r.wired).toHaveLength(0);
    expect(r.groups).toHaveLength(0);
    expect(r.messages.join("\n")).toContain("No NeuroDock servers detected");
  });

  it("--json emits machine-readable output", async () => {
    writeClaudeCodeConfig(sandbox.cwd, {
      "neurodock-translation": { command: "neurodock-mcp-translation" },
    });

    const r = await runExamples(
      { json: true },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
        colorEnabled: () => false,
      },
    );

    const parsed = JSON.parse(r.messages.join("\n")) as {
      wired: string[];
      groups: Array<{
        server: string;
        prompts: Array<{ prompt: string; tool: string }>;
      }>;
    };
    expect(parsed.wired).toContain("neurodock-translation");
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]?.server).toBe("neurodock-translation");
    expect(parsed.groups[0]?.prompts.length).toBeGreaterThanOrEqual(2);
  });

  it("--server filters to a single server", async () => {
    writeClaudeCodeConfig(sandbox.cwd, {
      "neurodock-chronometric": { command: "neurodock-mcp-chronometric" },
      "neurodock-cognitive-graph": { command: "neurodock-mcp-cognitive-graph" },
    });

    const r = await runExamples(
      { server: "neurodock-chronometric", json: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
        colorEnabled: () => false,
      },
    );

    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]?.server).toBe("neurodock-chronometric");
    const text = r.messages.join("\n");
    expect(text).toContain("get_time_context");
    expect(text).not.toContain("recall_entity");
  });

  it("--server reports when the named server isn't wired", async () => {
    writeClaudeCodeConfig(sandbox.cwd, {
      "neurodock-chronometric": { command: "neurodock-mcp-chronometric" },
    });

    const r = await runExamples(
      { server: "neurodock-translation", json: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
        colorEnabled: () => false,
      },
    );

    expect(r.groups).toHaveLength(0);
    expect(r.messages.join("\n")).toContain("not wired");
  });

  it("--server rejects unknown server names", async () => {
    writeClaudeCodeConfig(sandbox.cwd, {
      "neurodock-chronometric": { command: "neurodock-mcp-chronometric" },
    });

    const r = await runExamples(
      { server: "neurodock-not-a-real-thing", json: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
        colorEnabled: () => false,
      },
    );

    expect(r.groups).toHaveLength(0);
    expect(r.messages.join("\n")).toContain("Unknown --server");
  });
});
