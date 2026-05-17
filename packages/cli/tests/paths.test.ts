import { describe, it, expect } from "vitest";
import { sep } from "node:path";
import {
  claudeDesktopConfigPath,
  claudeCodeConfigPaths,
  cursorConfigPaths,
  profilePath,
  clientLocations,
} from "../src/lib/paths.js";

// Node's path.join uses the host platform's separator. We assert on the
// canonical components and let the runtime stitch them together.
function p(...parts: string[]): string {
  return parts.join(sep);
}

const baseEnv = {
  platform: "linux" as const,
  home: p("", "home", "me"),
  user: "me",
  cwd: p("", "work", "project"),
  env: {} as NodeJS.ProcessEnv,
};

describe("paths", () => {
  it("resolves Claude Desktop config on macOS", () => {
    const got = claudeDesktopConfigPath({ ...baseEnv, platform: "darwin" });
    expect(got).toBe(p(baseEnv.home, "Library", "Application Support", "Claude", "claude_desktop_config.json"));
  });

  it("resolves Claude Desktop config on Windows using APPDATA", () => {
    const got = claudeDesktopConfigPath({
      ...baseEnv,
      platform: "win32",
      home: "C:\\Users\\Me",
      env: { APPDATA: "C:\\Users\\Me\\AppData\\Roaming" } as NodeJS.ProcessEnv,
    });
    expect(got).toMatch(/claude_desktop_config\.json$/);
    expect(got).toContain("Claude");
    expect(got).toContain("AppData");
  });

  it("resolves Claude Desktop config on Linux", () => {
    const got = claudeDesktopConfigPath({ ...baseEnv, platform: "linux" });
    expect(got).toBe(p(baseEnv.home, ".config", "Claude", "claude_desktop_config.json"));
  });

  it("returns project and user Claude Code paths", () => {
    // Claude Code reads MCP from ~/.claude.json (user) and <cwd>/.mcp.json
    // (project). Not ~/.claude/settings.json — that's plugin state.
    const r = claudeCodeConfigPaths(baseEnv);
    expect(r.project).toBe(p(baseEnv.cwd, ".mcp.json"));
    expect(r.user).toBe(p(baseEnv.home, ".claude.json"));
  });

  it("returns project and user Cursor paths", () => {
    const r = cursorConfigPaths(baseEnv);
    expect(r.project).toBe(p(baseEnv.cwd, ".cursor", "mcp.json"));
    expect(r.user).toBe(p(baseEnv.home, ".cursor", "mcp.json"));
  });

  it("honours $NEURODOCK_PROFILE_PATH override", () => {
    const got = profilePath({
      ...baseEnv,
      env: { NEURODOCK_PROFILE_PATH: "/tmp/test/profile.yaml" } as NodeJS.ProcessEnv,
    });
    expect(got).toBe("/tmp/test/profile.yaml");
  });

  it("honours $XDG_CONFIG_HOME", () => {
    const xdg = p("", "xdg");
    const got = profilePath({ ...baseEnv, env: { XDG_CONFIG_HOME: xdg } as NodeJS.ProcessEnv });
    expect(got).toBe(p(xdg, "neurodock", "profile.yaml"));
  });

  it("falls back to ~/.neurodock/profile.yaml", () => {
    expect(profilePath(baseEnv)).toBe(p(baseEnv.home, ".neurodock", "profile.yaml"));
  });

  it("enumerates all client locations", () => {
    const locs = clientLocations(baseEnv);
    const ids = new Set(locs.map((l) => l.id));
    expect(ids.has("claude-desktop")).toBe(true);
    expect(ids.has("claude-code")).toBe(true);
    expect(ids.has("cursor")).toBe(true);
    expect(locs.length).toBeGreaterThanOrEqual(5);
  });
});
