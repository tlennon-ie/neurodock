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
  {
    key: "neurodock-chronometric",
    pkg: "mcp-chronometric",
    entrypoint: "neurodock-mcp-chronometric",
  },
  {
    key: "neurodock-cognitive-graph",
    pkg: "mcp-cognitive-graph",
    entrypoint: "neurodock-mcp-cognitive-graph",
  },
  {
    key: "neurodock-task-fractionator",
    pkg: "mcp-task-fractionator",
    entrypoint: "neurodock-mcp-task-fractionator",
  },
] as const;

export function buildMcpServers(
  ctx: McpEntryContext,
): Record<string, McpServerEntry> {
  const out: Record<string, McpServerEntry> = {};
  for (const s of NEURODOCK_SERVERS) {
    if (ctx.repoRoot) {
      const pkgPath = resolve(ctx.repoRoot, "packages", s.pkg);
      if (pathIsDir(pkgPath)) {
        // Dev-from-clone: invoke through the workspace .venv via uv run.
        out[s.key] = {
          command: "uv",
          args: ["run", s.entrypoint],
          cwd: pkgPath,
        };
        continue;
      }
    }
    // Installed-package path: the user ran `pip install` or `uv tool install`,
    // which puts the entrypoint on PATH as a platform-specific executable
    // (e.g. <python>/Scripts/<name>.exe on Windows). Invoke it directly —
    // wrapping in `uv run` here breaks on machines where uv is not on the
    // MCP-client subprocess PATH, which is common on Windows where GUI apps
    // inherit a narrower PATH than interactive shells.
    out[s.key] = {
      command: s.entrypoint,
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
