/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import prompts from "prompts";
import type { ClientId } from "../types.js";
import { readEnv } from "../lib/env.js";
import {
  detectClients,
  profileDir,
  profilePath,
  type DetectionResult,
} from "../lib/paths.js";
import { adapterFor } from "../clients/index.js";
import { parseJsonSafely } from "../lib/json-patch.js";

export interface UninstallOptions {
  readonly client: ClientId | "all";
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly purge: boolean;
}

export interface UninstallClientDiff {
  readonly client: ClientId;
  readonly path: string;
  readonly action: "removed" | "no-change" | "skip" | "untouched";
  readonly removedKeys: ReadonlyArray<string>;
  readonly preservedKeys: ReadonlyArray<string>;
  readonly reason?: string;
}

export interface UninstallDataDiff {
  readonly profilePath: string;
  readonly profileExists: boolean;
  readonly graphPath: string;
  readonly graphExists: boolean;
  readonly profileWillDelete: boolean;
  readonly graphWillDelete: boolean;
}

export interface UninstallRunResult {
  readonly clients: ReadonlyArray<UninstallClientDiff>;
  readonly data: UninstallDataDiff;
  readonly applied: boolean;
  readonly messages: ReadonlyArray<string>;
}

export interface UninstallDependencies {
  readonly envOverrides?: Parameters<typeof readEnv>[0];
  readonly confirmDelete?: (
    target: "profile" | "graph",
    path: string,
  ) => Promise<boolean>;
}

const NEURODOCK_PREFIX = "neurodock-";

export async function runUninstall(
  options: UninstallOptions,
  deps: UninstallDependencies = {},
): Promise<UninstallRunResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];

  const detections = detectClients(env);
  const targets = pickTargets(detections, options.client).filter(
    (t) => t.exists,
  );

  const clientDiffs: UninstallClientDiff[] = [];
  for (const target of targets) {
    clientDiffs.push(diffClient(target));
  }

  const dir = profileDir(env);
  const pPath = profilePath(env);
  const gPath = join(dir, "cognitive-graph.sqlite");
  const profileExists = existsSync(pPath);
  const graphExists = existsSync(gPath);

  let profileWillDelete = false;
  let graphWillDelete = false;

  if (options.purge) {
    profileWillDelete = profileExists;
    graphWillDelete = graphExists;
  } else if (!options.yes && !options.dryRun) {
    const confirm = deps.confirmDelete ?? defaultConfirm;
    if (profileExists) profileWillDelete = await confirm("profile", pPath);
    if (graphExists) graphWillDelete = await confirm("graph", gPath);
  }
  // --yes without --purge: both remain false (preserve data).

  const data: UninstallDataDiff = {
    profilePath: pPath,
    profileExists,
    graphPath: gPath,
    graphExists,
    profileWillDelete,
    graphWillDelete,
  };

  messages.push(...formatDiff(clientDiffs, data));

  if (options.dryRun) {
    return {
      clients: clientDiffs,
      data,
      applied: false,
      messages: ["Dry run. No changes written.", ...messages],
    };
  }

  for (const d of clientDiffs) {
    if (d.action === "removed") {
      applyClientDiff(d);
      messages.push(`Removed NeuroDock entries from ${d.client} at ${d.path}.`);
    } else if (d.action === "untouched") {
      messages.push(
        `${d.client} at ${d.path}: no NeuroDock entries to remove.`,
      );
    } else if (d.action === "skip") {
      messages.push(
        `Skipped ${d.client} at ${d.path}: ${d.reason ?? "parse error"}.`,
      );
    }
  }

  if (profileWillDelete) {
    try {
      rmSync(pPath, { force: true });
      messages.push(`Deleted ${pPath}.`);
    } catch (err: unknown) {
      messages.push(
        `Failed to delete ${pPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  } else if (profileExists) {
    messages.push(`Preserved ${pPath}.`);
  }

  if (graphWillDelete) {
    try {
      rmSync(gPath, { force: true });
      messages.push(`Deleted ${gPath}.`);
    } catch (err: unknown) {
      messages.push(
        `Failed to delete ${gPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  } else if (graphExists) {
    messages.push(`Preserved ${gPath}.`);
  }

  return { clients: clientDiffs, data, applied: true, messages };
}

function pickTargets(
  detections: ReadonlyArray<DetectionResult>,
  client: ClientId | "all",
): ReadonlyArray<DetectionResult> {
  if (client === "all") return detections;
  return detections.filter((d) => d.id === client);
}

function diffClient(target: DetectionResult): UninstallClientDiff {
  const raw = readFileSync(target.path, "utf8");
  const parsed = parseJsonSafely(raw);
  if (!parsed.ok) {
    return {
      client: target.id,
      path: target.path,
      action: "skip",
      removedKeys: [],
      preservedKeys: [],
      reason: `existing config is not valid JSON: ${parsed.error}`,
    };
  }
  const existing = (parsed.value ?? {}) as {
    mcpServers?: Record<string, unknown>;
  };
  const servers = existing.mcpServers ?? {};
  const removedKeys = Object.keys(servers).filter((k) =>
    k.startsWith(NEURODOCK_PREFIX),
  );
  const preservedKeys = Object.keys(servers).filter(
    (k) => !k.startsWith(NEURODOCK_PREFIX),
  );
  if (removedKeys.length === 0) {
    return {
      client: target.id,
      path: target.path,
      action: "untouched",
      removedKeys: [],
      preservedKeys,
    };
  }
  return {
    client: target.id,
    path: target.path,
    action: "removed",
    removedKeys,
    preservedKeys,
  };
}

function applyClientDiff(diff: UninstallClientDiff): void {
  const adapter = adapterFor(diff.client);
  const raw = readFileSync(diff.path, "utf8");
  const parsed = parseJsonSafely(raw);
  if (!parsed.ok) return;
  const existing = (parsed.value ?? {}) as Record<string, unknown> & {
    mcpServers?: Record<string, unknown>;
  };
  const servers = { ...(existing.mcpServers ?? {}) };
  for (const key of diff.removedKeys) {
    delete servers[key];
  }
  const baseWithoutServers: Record<string, unknown> = { ...existing };
  delete baseWithoutServers["mcpServers"];
  const shaped = adapter.shapeConfig(
    baseWithoutServers,
    servers as Record<string, never>,
  );
  mkdirSync(dirname(diff.path), { recursive: true });
  writeFileSync(diff.path, `${JSON.stringify(shaped, null, 2)}\n`, "utf8");
}

async function defaultConfirm(
  target: "profile" | "graph",
  path: string,
): Promise<boolean> {
  const label =
    target === "profile"
      ? `Delete profile at ${path}?`
      : `Delete cognitive graph at ${path}?`;
  const response = await prompts({
    type: "confirm",
    name: "ok",
    message: label,
    initial: false,
  });
  return response.ok === true;
}

function formatDiff(
  clients: ReadonlyArray<UninstallClientDiff>,
  data: UninstallDataDiff,
): string[] {
  const out: string[] = [];
  out.push("Planned changes:");
  if (clients.length === 0) {
    out.push("  (no client configs detected)");
  }
  for (const d of clients) {
    out.push(`Client ${d.client} (${d.action}): ${d.path}`);
    for (const k of d.removedKeys) out.push(`  - mcpServers.${k}`);
    for (const k of d.preservedKeys)
      out.push(`  = mcpServers.${k} (preserved)`);
    if (d.reason) out.push(`  reason: ${d.reason}`);
  }
  out.push("Data files:");
  out.push(
    `  profile: ${data.profilePath} (${
      data.profileExists
        ? data.profileWillDelete
          ? "will delete"
          : "preserve"
        : "absent"
    })`,
  );
  out.push(
    `  graph:   ${data.graphPath} (${
      data.graphExists
        ? data.graphWillDelete
          ? "will delete"
          : "preserve"
        : "absent"
    })`,
  );
  return out;
}
