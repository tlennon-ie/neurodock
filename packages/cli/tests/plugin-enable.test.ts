import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  runPluginAdd,
  runPluginEnable,
  ENABLED_MARKER,
} from "../src/commands/plugin.js";
import {
  makeSandbox,
  writePluginSource,
  type Sandbox,
} from "./plugin-helpers.js";

describe("neurodock plugin enable", () => {
  let sandbox: Sandbox;
  beforeEach(() => {
    sandbox = makeSandbox("neurodock-plugin-enable-");
  });
  afterEach(() => sandbox.cleanup());

  async function installPlugin(name: string): Promise<string> {
    const source = writePluginSource(sandbox.cwd, name);
    const r = await runPluginAdd(
      { source, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    return source;
  }

  it("writes the .enabled marker file for an installed plugin", async () => {
    await installPlugin("activate-me");
    const r = await runPluginEnable(
      { name: "activate-me" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("enabled");
    const markerPath = join(sandbox.pluginsRoot, "activate-me", ENABLED_MARKER);
    expect(existsSync(markerPath)).toBe(true);
  });

  it("is idempotent when the plugin is already enabled", async () => {
    await installPlugin("already-on");
    await runPluginEnable(
      { name: "already-on" },
      { envOverrides: sandbox.envOverrides },
    );
    const r = await runPluginEnable(
      { name: "already-on" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("already-enabled");
  });

  it("returns exit 1 when the plugin is not installed", async () => {
    const r = await runPluginEnable(
      { name: "never-installed" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.action).toBe("missing");
    expect(r.messages.join("\n")).toContain("not installed");
  });

  it("prints the restart-your-MCP-client hint on success", async () => {
    await installPlugin("hint-plugin");
    const r = await runPluginEnable(
      { name: "hint-plugin" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.messages.join("\n")).toContain("Restart your MCP client");
  });

  it("creates the marker inside the plugin's own install directory", async () => {
    await installPlugin("marker-location");
    const r = await runPluginEnable(
      { name: "marker-location" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.markerPath).toBe(
      join(sandbox.pluginsRoot, "marker-location", ENABLED_MARKER),
    );
  });
});
