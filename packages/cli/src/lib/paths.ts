/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { ClientLocation, ClientId } from "../types.js";
import { type EnvSnapshot, readEnv } from "./env.js";

export function profilePath(env: EnvSnapshot = readEnv()): string {
  // Loader precedence (see profile.schema.json $comment):
  //   1. $NEURODOCK_PROFILE_PATH
  //   2. $XDG_CONFIG_HOME/neurodock/profile.yaml
  //   3. ~/.neurodock/profile.yaml
  const override = env.env["NEURODOCK_PROFILE_PATH"];
  if (override && override.trim().length > 0) {
    return override;
  }
  const xdg = env.env["XDG_CONFIG_HOME"];
  if (xdg && xdg.trim().length > 0) {
    return join(xdg, "neurodock", "profile.yaml");
  }
  return join(env.home, ".neurodock", "profile.yaml");
}

export function profileDir(env: EnvSnapshot = readEnv()): string {
  const override = env.env["NEURODOCK_PROFILE_PATH"];
  if (override && override.trim().length > 0) {
    return dirOf(override);
  }
  const xdg = env.env["XDG_CONFIG_HOME"];
  if (xdg && xdg.trim().length > 0) {
    return join(xdg, "neurodock");
  }
  return join(env.home, ".neurodock");
}

/**
 * Root directory for installed plugins. Resolves to
 * `<profileDir>/plugins/` so test sandboxes that set
 * `NEURODOCK_PROFILE_PATH` get an isolated plugin tree for free.
 *
 * v0.1.0 per ADR 0007: the substrate auto-discovers any
 * `<pluginsDir>/<name>/plugin.yaml` it finds; a sibling `.enabled` marker
 * file (managed by `neurodock plugin enable/disable`) gates activation.
 */
export function pluginsDir(env: EnvSnapshot = readEnv()): string {
  return join(profileDir(env), "plugins");
}

function dirOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return idx <= 0 ? "." : filePath.slice(0, idx);
}

export function claudeDesktopConfigPath(env: EnvSnapshot = readEnv()): string {
  switch (env.platform) {
    case "darwin":
      return join(
        env.home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      );
    case "win32": {
      const appdata = env.env["APPDATA"];
      const root =
        appdata && appdata.trim().length > 0
          ? appdata
          : join(env.home, "AppData", "Roaming");
      return join(root, "Claude", "claude_desktop_config.json");
    }
    default:
      return join(env.home, ".config", "Claude", "claude_desktop_config.json");
  }
}

export interface ClaudeCodePaths {
  readonly user: string;
  readonly project: string;
}

export function claudeCodeConfigPaths(
  env: EnvSnapshot = readEnv(),
): ClaudeCodePaths {
  // Claude Code reads MCP server config from ~/.claude.json (flat file in
  // $HOME, dot prefix). The ~/.claude/settings.json file is for plugins +
  // marketplace state — NOT MCP servers. Project-scoped MCP config lives
  // in <project>/.mcp.json (different filename from the user-scoped file).
  return {
    user: join(env.home, ".claude.json"),
    project: join(env.cwd, ".mcp.json"),
  };
}

export interface CursorPaths {
  readonly user: string;
  readonly project: string;
}

export function cursorConfigPaths(env: EnvSnapshot = readEnv()): CursorPaths {
  return {
    user: join(env.home, ".cursor", "mcp.json"),
    project: join(env.cwd, ".cursor", "mcp.json"),
  };
}

export function clientLocations(
  env: EnvSnapshot = readEnv(),
): ReadonlyArray<ClientLocation> {
  const cc = claudeCodeConfigPaths(env);
  const cu = cursorConfigPaths(env);
  return [
    { id: "claude-desktop", path: claudeDesktopConfigPath(env), scope: "user" },
    { id: "claude-code", path: cc.project, scope: "project" },
    { id: "claude-code", path: cc.user, scope: "user" },
    { id: "cursor", path: cu.project, scope: "project" },
    { id: "cursor", path: cu.user, scope: "user" },
  ];
}

export interface DetectionResult extends ClientLocation {
  readonly exists: boolean;
}

export function detectClients(
  env: EnvSnapshot = readEnv(),
): ReadonlyArray<DetectionResult> {
  return clientLocations(env).map((loc) => ({
    ...loc,
    exists: pathExists(loc.path),
  }));
}

export function pickClient(
  detections: ReadonlyArray<DetectionResult>,
  requested: ClientId | "all",
): ReadonlyArray<DetectionResult> {
  if (requested === "all") {
    return detections;
  }
  return detections.filter((d) => d.id === requested);
}

function pathExists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

export function fileExists(p: string): boolean {
  return existsSync(p);
}
