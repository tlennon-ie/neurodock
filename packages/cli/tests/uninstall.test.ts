import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUninstall } from "../src/commands/uninstall.js";

function makeSandbox(): { home: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-uninstall-"));
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

function seedClaudeCode(cwd: string): string {
  const cfg = join(cwd, ".mcp.json");
  writeFileSync(
    cfg,
    JSON.stringify(
      {
        mcpServers: {
          "neurodock-chronometric": {
            command: "uv",
            args: ["run", "neurodock-mcp-chronometric"],
          },
          "neurodock-cognitive-graph": {
            command: "uv",
            args: ["run", "neurodock-mcp-cognitive-graph"],
          },
          "third-party": { command: "node", args: ["custom.js"] },
        },
        unrelatedKey: "keep me",
      },
      null,
      2,
    ),
    "utf8",
  );
  return cfg;
}

function seedNeurodockDataDir(home: string): {
  profile: string;
  graph: string;
} {
  const dir = join(home, ".neurodock");
  mkdirSync(dir, { recursive: true });
  const profile = join(dir, "profile.yaml");
  const graph = join(dir, "cognitive-graph.sqlite");
  writeFileSync(
    profile,
    "identity:\n  display_name: t\n  neurotypes: [adhd]\n",
  );
  writeFileSync(graph, "stub");
  return { profile, graph };
}

describe("neurodock uninstall", () => {
  let sandbox: ReturnType<typeof makeSandbox>;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => sandbox.cleanup());

  it("removes NeuroDock entries while preserving user customisations (default: keep data)", async () => {
    const cfg = seedClaudeCode(sandbox.cwd);
    const data = seedNeurodockDataDir(sandbox.home);

    const r = await runUninstall(
      { client: "claude-code", dryRun: false, yes: true, purge: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.applied).toBe(true);
    expect(r.clients[0]!.action).toBe("removed");
    expect(r.clients[0]!.removedKeys).toContain("neurodock-chronometric");
    expect(r.clients[0]!.removedKeys).toContain("neurodock-cognitive-graph");
    expect(r.clients[0]!.preservedKeys).toContain("third-party");

    const written = JSON.parse(readFileSync(cfg, "utf8")) as {
      mcpServers: Record<string, unknown>;
      unrelatedKey: string;
    };
    expect(written.mcpServers["neurodock-chronometric"]).toBeUndefined();
    expect(written.mcpServers["neurodock-cognitive-graph"]).toBeUndefined();
    expect(written.mcpServers["third-party"]).toBeDefined();
    expect(written.unrelatedKey).toBe("keep me");

    expect(existsSync(data.profile)).toBe(true);
    expect(existsSync(data.graph)).toBe(true);
  });

  it("--purge deletes the profile and graph", async () => {
    seedClaudeCode(sandbox.cwd);
    const data = seedNeurodockDataDir(sandbox.home);

    const r = await runUninstall(
      { client: "claude-code", dryRun: false, yes: true, purge: true },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.applied).toBe(true);
    expect(r.data.profileWillDelete).toBe(true);
    expect(r.data.graphWillDelete).toBe(true);
    expect(existsSync(data.profile)).toBe(false);
    expect(existsSync(data.graph)).toBe(false);
  });

  it("--yes alone (no --purge) leaves data dirs alone", async () => {
    seedClaudeCode(sandbox.cwd);
    const data = seedNeurodockDataDir(sandbox.home);

    await runUninstall(
      { client: "claude-code", dryRun: false, yes: true, purge: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(existsSync(data.profile)).toBe(true);
    expect(existsSync(data.graph)).toBe(true);
  });

  it("dry-run prints diff and writes nothing", async () => {
    const cfg = seedClaudeCode(sandbox.cwd);
    const dataBefore = readFileSync(cfg, "utf8");
    const data = seedNeurodockDataDir(sandbox.home);

    const r = await runUninstall(
      { client: "claude-code", dryRun: true, yes: false, purge: true },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );

    expect(r.applied).toBe(false);
    expect(r.messages.join("\n")).toContain("Dry run");
    expect(readFileSync(cfg, "utf8")).toBe(dataBefore);
    expect(existsSync(data.profile)).toBe(true);
    expect(existsSync(data.graph)).toBe(true);
  });

  it("uses the confirmDelete seam for interactive prompts when --yes is absent", async () => {
    seedClaudeCode(sandbox.cwd);
    const data = seedNeurodockDataDir(sandbox.home);

    const calls: Array<"profile" | "graph"> = [];
    const r = await runUninstall(
      { client: "claude-code", dryRun: false, yes: false, purge: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
        confirmDelete: async (target) => {
          calls.push(target);
          return target === "graph";
        },
      },
    );
    expect(calls).toEqual(["profile", "graph"]);
    expect(r.data.profileWillDelete).toBe(false);
    expect(r.data.graphWillDelete).toBe(true);
    expect(existsSync(data.profile)).toBe(true);
    expect(existsSync(data.graph)).toBe(false);
  });

  it("reports 'untouched' when no NeuroDock entries are present", async () => {
    const claudeDir = join(sandbox.cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const cfg = join(sandbox.cwd, ".mcp.json");
    writeFileSync(
      cfg,
      JSON.stringify(
        { mcpServers: { "third-party": { command: "node", args: [] } } },
        null,
        2,
      ),
    );
    const r = await runUninstall(
      { client: "claude-code", dryRun: false, yes: true, purge: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.clients[0]!.action).toBe("untouched");
    const after = JSON.parse(readFileSync(cfg, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(after.mcpServers["third-party"]).toBeDefined();
  });
});
