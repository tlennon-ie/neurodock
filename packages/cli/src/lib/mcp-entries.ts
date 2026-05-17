import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { McpServerEntry } from "../types.js";
import type { EnvSnapshot } from "./env.js";

export interface McpEntryContext {
  /** Set when the user is running from a cloned monorepo; undefined otherwise. */
  readonly repoRoot?: string;
}

export function detectRepoRoot(env: EnvSnapshot): string | undefined {
  let current = env.cwd;
  // Walk up to 8 levels max — well above any reasonable nested call site.
  for (let depth = 0; depth < 8; depth += 1) {
    const marker = join(current, "pnpm-workspace.yaml");
    if (existsSync(marker)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Also try the directory containing the running script (when packaged the
  // user typically runs from elsewhere and there will be no marker).
  return undefined;
}

const NEURODOCK_SERVERS = [
  { key: "neurodock-chronometric", pkg: "mcp-chronometric", entrypoint: "neurodock-mcp-chronometric" },
  { key: "neurodock-cognitive-graph", pkg: "mcp-cognitive-graph", entrypoint: "neurodock-mcp-cognitive-graph" },
  { key: "neurodock-task-fractionator", pkg: "mcp-task-fractionator", entrypoint: "neurodock-mcp-task-fractionator" },
] as const;

export function buildMcpServers(ctx: McpEntryContext): Record<string, McpServerEntry> {
  const out: Record<string, McpServerEntry> = {};
  for (const s of NEURODOCK_SERVERS) {
    if (ctx.repoRoot) {
      const pkgPath = resolve(ctx.repoRoot, "packages", s.pkg);
      if (pathIsDir(pkgPath)) {
        out[s.key] = {
          command: "uv",
          args: ["run", s.entrypoint],
          cwd: pkgPath,
        };
        continue;
      }
    }
    // Installed-package fallback. Assumes the user installed the Python
    // distributions globally via `uv tool install` or `pip install`.
    out[s.key] = {
      command: "uv",
      args: ["run", s.entrypoint],
    };
  }
  return out;
}

function pathIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
