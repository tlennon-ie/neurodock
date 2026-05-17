import type { McpClientConfig, McpServerEntry } from "../types.js";

export interface MergeResult {
  readonly merged: McpClientConfig;
  readonly added: ReadonlyArray<string>;
  readonly collisions: ReadonlyArray<string>;
  readonly unchanged: boolean;
}

/**
 * Deep-merge MCP server entries into a client config, preserving all unknown
 * top-level keys and never clobbering existing server keys unless `overwrite`
 * is explicitly true. Existing keys go into `collisions`; the caller decides
 * whether to overwrite (with `--yes`) or skip.
 */
export function mergeMcpServers(
  current: McpClientConfig | null | undefined,
  desired: Readonly<Record<string, McpServerEntry>>,
  overwrite: boolean,
): MergeResult {
  const base: McpClientConfig = current ?? {};
  const existingServers = (base.mcpServers ?? {}) as Record<string, McpServerEntry>;

  const added: string[] = [];
  const collisions: string[] = [];
  const nextServers: Record<string, McpServerEntry> = { ...existingServers };

  for (const [key, entry] of Object.entries(desired)) {
    const existing = existingServers[key];
    if (existing === undefined) {
      nextServers[key] = entry;
      added.push(key);
      continue;
    }
    if (serverEntriesEqual(existing, entry)) {
      // no-op
      continue;
    }
    if (overwrite) {
      nextServers[key] = entry;
      added.push(key);
    } else {
      collisions.push(key);
    }
  }

  const unchanged = added.length === 0 && collisions.length === 0;
  const merged: McpClientConfig = { ...base, mcpServers: nextServers };
  return { merged, added, collisions, unchanged };
}

function serverEntriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  if (a.command !== b.command) return false;
  if (a.cwd !== b.cwd) return false;
  const aArgs = a.args ?? [];
  const bArgs = b.args ?? [];
  if (aArgs.length !== bArgs.length) return false;
  for (let i = 0; i < aArgs.length; i += 1) {
    if (aArgs[i] !== bArgs[i]) return false;
  }
  return shallowEnvEqual(a.env, b.env);
}

function shallowEnvEqual(
  a: Readonly<Record<string, string>> | undefined,
  b: Readonly<Record<string, string>> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return Object.keys(a ?? {}).length === 0 && Object.keys(b ?? {}).length === 0;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] !== kb[i]) return false;
    const key = ka[i] as string;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function parseJsonSafely(source: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
