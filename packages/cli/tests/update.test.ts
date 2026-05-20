import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdate } from "../src/commands/update.js";

function makeSandbox(): { home: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-update-"));
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

const STALE_NEURODOCK_ENTRY = {
  command: "uv",
  args: ["run", "stale-entrypoint-from-old-version"],
};

describe("neurodock update", () => {
  let sandbox: ReturnType<typeof makeSandbox>;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => sandbox.cleanup());

  it("detects stale NeuroDock entries and lists them in the dry-run diff", async () => {
    const claudeDir = join(sandbox.cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const cfg = join(sandbox.cwd, ".mcp.json");
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          mcpServers: {
            "neurodock-chronometric": STALE_NEURODOCK_ENTRY,
            "neurodock-cognitive-graph": STALE_NEURODOCK_ENTRY,
            "neurodock-task-fractionator": STALE_NEURODOCK_ENTRY,
            "third-party": { command: "node", args: ["custom.js"] },
          },
          unrelatedKey: "keep me",
        },
        null,
        2,
      ),
      "utf8",
    );

    const r = await runUpdate(
      { client: "claude-code", dryRun: true },
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
    expect(r.clients).toHaveLength(1);
    const d = r.clients[0]!;
    expect(d.action).toBe("updated");
    expect(d.updatedKeys).toContain("neurodock-chronometric");
    expect(d.updatedKeys).toContain("neurodock-cognitive-graph");
    expect(d.updatedKeys).toContain("neurodock-task-fractionator");
    expect(d.preservedKeys).toContain("third-party");

    const onDisk = JSON.parse(readFileSync(cfg, "utf8")) as {
      mcpServers: Record<string, { args: string[] }>;
    };
    expect(onDisk.mcpServers["neurodock-chronometric"]!.args).toEqual(
      STALE_NEURODOCK_ENTRY.args,
    );
  });

  it("rewrites stale NeuroDock entries while preserving customisations", async () => {
    const claudeDir = join(sandbox.cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const cfg = join(sandbox.cwd, ".mcp.json");
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          mcpServers: {
            "neurodock-chronometric": STALE_NEURODOCK_ENTRY,
            "neurodock-cognitive-graph": STALE_NEURODOCK_ENTRY,
            "neurodock-task-fractionator": STALE_NEURODOCK_ENTRY,
            "third-party": { command: "node", args: ["custom.js"] },
          },
          unrelatedKey: "keep me",
          deeply: { nested: { user: "config" } },
        },
        null,
        2,
      ),
      "utf8",
    );

    const r = await runUpdate(
      { client: "claude-code", dryRun: false },
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

    const written = JSON.parse(readFileSync(cfg, "utf8")) as {
      mcpServers: Record<string, { args: string[] }>;
      unrelatedKey: string;
      deeply: { nested: { user: string } };
    };
    expect(written.mcpServers["neurodock-chronometric"]!.args).not.toEqual(
      STALE_NEURODOCK_ENTRY.args,
    );
    expect(written.mcpServers["third-party"]).toBeDefined();
    expect(written.unrelatedKey).toBe("keep me");
    expect(written.deeply.nested.user).toBe("config");
  });

  it("reports no-change when entries are already up to date", async () => {
    const cfg = join(sandbox.cwd, ".mcp.json");
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          mcpServers: {
            "neurodock-chronometric": { command: "neurodock-mcp-chronometric" },
            "neurodock-cognitive-graph": {
              command: "neurodock-mcp-cognitive-graph",
            },
            "neurodock-task-fractionator": {
              command: "neurodock-mcp-task-fractionator",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const r = await runUpdate(
      { client: "claude-code", dryRun: false },
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
    const actions = r.clients.map((c) => c.action);
    expect(actions).toContain("no-change");
  });

  it("returns 'not-wired' when no NeuroDock entries are present", async () => {
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
      "utf8",
    );
    const r = await runUpdate(
      { client: "claude-code", dryRun: false },
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
    expect(r.clients[0]!.action).toBe("not-wired");
    const after = JSON.parse(readFileSync(cfg, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(after.mcpServers["third-party"]).toBeDefined();
  });

  it("reports nothing-to-update when no client configs exist", async () => {
    const r = await runUpdate(
      { client: "all", dryRun: false },
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
    expect(r.messages.join("\n")).toContain("No client configs found");
  });
});
