/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ClientId, McpServerEntry } from "../types.js";
import { readEnv } from "../lib/env.js";
import { detectClients, type DetectionResult } from "../lib/paths.js";
import { adapterFor } from "../clients/index.js";
import { parseJsonSafely } from "../lib/json-patch.js";
import { buildMcpServers, detectRepoRoot } from "../lib/mcp-entries.js";

export interface SyncOptions {
  readonly client: ClientId | "all";
  readonly dryRun: boolean;
}

export interface SyncClientDiff {
  readonly client: ClientId;
  readonly path: string;
  readonly action: "updated" | "no-change" | "skip" | "not-wired";
  readonly updatedKeys: ReadonlyArray<string>;
  readonly preservedKeys: ReadonlyArray<string>;
  readonly reason?: string;
}

export interface SyncRunResult {
  readonly clients: ReadonlyArray<SyncClientDiff>;
  readonly applied: boolean;
  readonly messages: ReadonlyArray<string>;
}

export interface SyncDependencies {
  readonly envOverrides?: Parameters<typeof readEnv>[0];
}

const NEURODOCK_PREFIX = "neurodock-";

export async function runSync(
  options: SyncOptions,
  deps: SyncDependencies = {},
): Promise<SyncRunResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];

  const detections = detectClients(env);
  const targets = pickTargets(detections, options.client).filter(
    (t) => t.exists,
  );

  if (targets.length === 0) {
    messages.push("No client configs found to update.");
    if (options.client !== "all") {
      messages.push(
        `Looked for ${options.client} but no existing config was found.`,
      );
    }
    return { clients: [], applied: false, messages };
  }

  const repoRoot = detectRepoRoot(env);
  const desiredServers = buildMcpServers({
    ...(repoRoot !== undefined ? { repoRoot } : {}),
  });

  const diffs: SyncClientDiff[] = [];
  for (const target of targets) {
    diffs.push(diffClient(target, desiredServers));
  }

  if (options.dryRun) {
    return {
      clients: diffs,
      applied: false,
      messages: [
        "Dry run. No changes written.",
        ...messages,
        ...formatDiffs(diffs),
      ],
    };
  }

  for (const d of diffs) {
    if (d.action === "updated") {
      applyDiff(d, desiredServers);
      messages.push(
        `Updated ${d.client} at ${d.path}: ${d.updatedKeys.join(", ")}.`,
      );
    } else if (d.action === "no-change") {
      messages.push(`${d.client} at ${d.path} already up to date.`);
    } else if (d.action === "not-wired") {
      messages.push(
        `${d.client} at ${d.path} has no NeuroDock servers wired. Run 'neurodock init' first.`,
      );
    } else if (d.action === "skip") {
      messages.push(
        `Skipped ${d.client} at ${d.path}: ${d.reason ?? "unable to parse"}.`,
      );
    }
  }

  return { clients: diffs, applied: true, messages };
}

function pickTargets(
  detections: ReadonlyArray<DetectionResult>,
  client: ClientId | "all",
): ReadonlyArray<DetectionResult> {
  if (client === "all") return detections;
  return detections.filter((d) => d.id === client);
}

function diffClient(
  target: DetectionResult,
  desired: Readonly<Record<string, McpServerEntry>>,
): SyncClientDiff {
  const raw = readFileSync(target.path, "utf8");
  const parsed = parseJsonSafely(raw);
  if (!parsed.ok) {
    return {
      client: target.id,
      path: target.path,
      action: "skip",
      updatedKeys: [],
      preservedKeys: [],
      reason: `existing config is not valid JSON: ${parsed.error}`,
    };
  }
  const existing = (parsed.value ?? {}) as {
    mcpServers?: Record<string, McpServerEntry>;
  };
  const existingServers = existing.mcpServers ?? {};
  const allKeys = Object.keys(existingServers);
  const neurodockKeys = allKeys.filter((k) => k.startsWith(NEURODOCK_PREFIX));
  const preservedKeys = allKeys.filter((k) => !k.startsWith(NEURODOCK_PREFIX));

  if (neurodockKeys.length === 0) {
    return {
      client: target.id,
      path: target.path,
      action: "not-wired",
      updatedKeys: [],
      preservedKeys,
    };
  }

  const updatedKeys: string[] = [];
  for (const key of neurodockKeys) {
    const desiredEntry = desired[key];
    if (desiredEntry === undefined) continue;
    if (!entriesEqual(existingServers[key] as McpServerEntry, desiredEntry)) {
      updatedKeys.push(key);
    }
  }

  if (updatedKeys.length === 0) {
    return {
      client: target.id,
      path: target.path,
      action: "no-change",
      updatedKeys: [],
      preservedKeys,
    };
  }
  return {
    client: target.id,
    path: target.path,
    action: "updated",
    updatedKeys,
    preservedKeys,
  };
}

function applyDiff(
  diff: SyncClientDiff,
  desired: Readonly<Record<string, McpServerEntry>>,
): void {
  const adapter = adapterFor(diff.client);
  const raw = readFileSync(diff.path, "utf8");
  const parsed = parseJsonSafely(raw);
  if (!parsed.ok) return;
  const existing = (parsed.value ?? {}) as Record<string, unknown> & {
    mcpServers?: Record<string, McpServerEntry>;
  };
  const existingServers = existing.mcpServers ?? {};
  const nextServers: Record<string, McpServerEntry> = { ...existingServers };
  for (const key of diff.updatedKeys) {
    const next = desired[key];
    if (next !== undefined) nextServers[key] = next;
  }
  const shaped = adapter.shapeConfig(existing, nextServers);
  mkdirSync(dirname(diff.path), { recursive: true });
  writeFileSync(diff.path, `${JSON.stringify(shaped, null, 2)}\n`, "utf8");
}

function entriesEqual(
  a: McpServerEntry | undefined,
  b: McpServerEntry,
): boolean {
  if (a === undefined) return false;
  if (a.command !== b.command) return false;
  if (a.cwd !== b.cwd) return false;
  const aArgs = a.args ?? [];
  const bArgs = b.args ?? [];
  if (aArgs.length !== bArgs.length) return false;
  for (let i = 0; i < aArgs.length; i += 1) {
    if (aArgs[i] !== bArgs[i]) return false;
  }
  return envEqual(a.env, b.env);
}

function envEqual(
  a: Readonly<Record<string, string>> | undefined,
  b: Readonly<Record<string, string>> | undefined,
): boolean {
  if (a === b) return true;
  const ka = a ? Object.keys(a).sort() : [];
  const kb = b ? Object.keys(b).sort() : [];
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) {
    const key = ka[i];
    if (key !== kb[i]) return false;
    if (key !== undefined && a?.[key] !== b?.[key]) return false;
  }
  return true;
}

function formatDiffs(diffs: ReadonlyArray<SyncClientDiff>): string[] {
  const out: string[] = [];
  for (const d of diffs) {
    out.push(`Client ${d.client} (${d.action}): ${d.path}`);
    for (const k of d.updatedKeys) out.push(`  ~ mcpServers.${k}`);
    for (const k of d.preservedKeys)
      out.push(`  = mcpServers.${k} (preserved)`);
    if (d.reason) out.push(`  reason: ${d.reason}`);
  }
  return out;
}
