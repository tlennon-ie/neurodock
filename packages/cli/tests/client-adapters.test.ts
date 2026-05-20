import { describe, it, expect } from "vitest";
import { allAdapters, adapterFor } from "../src/clients/index.js";
import { mergeMcpServers } from "../src/lib/json-patch.js";
import type { McpServerEntry } from "../src/types.js";

const env = {
  platform: "darwin" as const,
  home: "/Users/me",
  user: "me",
  cwd: "/work/project",
  env: {} as NodeJS.ProcessEnv,
};

const desired: Record<string, McpServerEntry> = {
  "neurodock-chronometric": {
    command: "uv",
    args: ["run", "neurodock-mcp-chronometric"],
  },
};

describe("client adapters", () => {
  it("exposes Claude Desktop, Claude Code, and Cursor adapters", () => {
    const ids = allAdapters.map((a) => a.id).sort();
    expect(ids).toEqual(["claude-code", "claude-desktop", "cursor"]);
  });

  it("locates a config path for each client per OS", () => {
    for (const a of allAdapters) {
      const paths = a.configPaths(env);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        expect(p.path.length).toBeGreaterThan(0);
        expect(["user", "project"]).toContain(p.scope);
      }
    }
  });

  it("Claude Code adapter prefers project scope over user scope", () => {
    const a = adapterFor("claude-code");
    const paths = a.configPaths(env);
    expect(paths[0]!.scope).toBe("project");
  });

  it("merges desired entries idempotently", () => {
    const r1 = mergeMcpServers({ mcpServers: {} }, desired, false);
    expect(r1.added).toEqual(["neurodock-chronometric"]);

    const r2 = mergeMcpServers(r1.merged, desired, false);
    expect(r2.added).toEqual([]);
    expect(r2.collisions).toEqual([]);
    expect(r2.unchanged).toBe(true);
  });

  it("flags collisions when an existing key would change", () => {
    const existing = {
      mcpServers: {
        "neurodock-chronometric": { command: "python", args: ["-m", "other"] },
      },
    };
    const r = mergeMcpServers(existing, desired, false);
    expect(r.collisions).toContain("neurodock-chronometric");
  });

  it("overwrites collisions when overwrite=true (--yes)", () => {
    const existing = {
      mcpServers: {
        "neurodock-chronometric": { command: "python", args: ["-m", "other"] },
      },
    };
    const r = mergeMcpServers(existing, desired, true);
    expect(r.added).toContain("neurodock-chronometric");
    expect(r.collisions).toEqual([]);
  });

  it("preserves unrelated top-level keys", () => {
    const existing = {
      mcpServers: { "external-server": { command: "x", args: [] } },
      otherKey: { keep: "me" },
    };
    const r = mergeMcpServers(existing, desired, false);
    const merged = r.merged as Record<string, unknown>;
    expect(merged["otherKey"]).toEqual({ keep: "me" });
    const servers = merged["mcpServers"] as Record<string, unknown>;
    expect(servers["external-server"]).toBeDefined();
    expect(servers["neurodock-chronometric"]).toBeDefined();
  });
});
