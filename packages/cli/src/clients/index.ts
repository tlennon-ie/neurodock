/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import type { ClientId, McpServerEntry } from "../types.js";
import type { EnvSnapshot } from "../lib/env.js";
import { claudeDesktopAdapter } from "./claude-desktop.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { cursorAdapter } from "./cursor.js";

export interface ClientAdapter {
  readonly id: ClientId;
  readonly displayName: string;
  /** Possible config file locations, highest precedence first. */
  configPaths(env: EnvSnapshot): ReadonlyArray<ConfigCandidate>;
  /** Wrap an mcpServers map into the shape this client expects. */
  shapeConfig(
    existing: unknown,
    mcpServers: Record<string, McpServerEntry>,
  ): unknown;
}

export interface ConfigCandidate {
  readonly path: string;
  readonly scope: "user" | "project";
}

export const allAdapters: ReadonlyArray<ClientAdapter> = [
  claudeDesktopAdapter,
  claudeCodeAdapter,
  cursorAdapter,
];

export function adapterFor(id: ClientId): ClientAdapter {
  const found = allAdapters.find((a) => a.id === id);
  if (!found) {
    throw new Error(`Unknown client id: ${id}`);
  }
  return found;
}
