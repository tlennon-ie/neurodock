import type { ClientAdapter } from "./index.js";
import type { McpServerEntry } from "../types.js";
import { claudeCodeConfigPaths } from "../lib/paths.js";

export const claudeCodeAdapter: ClientAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  configPaths(env) {
    const paths = claudeCodeConfigPaths(env);
    return [
      { path: paths.project, scope: "project" },
      { path: paths.user, scope: "user" },
    ];
  },
  shapeConfig(existing, mcpServers) {
    const base = isObject(existing) ? { ...existing } : {};
    const prev = isObject(base["mcpServers"])
      ? (base["mcpServers"] as Record<string, McpServerEntry>)
      : {};
    base["mcpServers"] = { ...prev, ...mcpServers };
    return base;
  },
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
