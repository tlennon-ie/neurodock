/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import type { ClientAdapter } from "./index.js";
import type { McpServerEntry } from "../types.js";
import { cursorConfigPaths } from "../lib/paths.js";

export const cursorAdapter: ClientAdapter = {
  id: "cursor",
  displayName: "Cursor",
  configPaths(env) {
    const paths = cursorConfigPaths(env);
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
