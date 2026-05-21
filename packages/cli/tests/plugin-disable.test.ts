import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  runPluginAdd,
  runPluginEnable,
  runPluginDisable,
  ENABLED_MARKER,
} from "../src/commands/plugin.js";
import {
  makeSandbox,
  writePluginSource,
  type Sandbox,
} from "./plugin-helpers.js";

describe("neurodock plugin disable", () => {
  let sandbox: Sandbox;
  beforeEach(() => {
    sandbox = makeSandbox("neurodock-plugin-disable-");
  });
  afterEach(() => sandbox.cleanup());

  async function installAndEnable(name: string): Promise<void> {
    const source = writePluginSource(sandbox.cwd, name);
    await runPluginAdd(
      { source, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    await runPluginEnable({ name }, { envOverrides: sandbox.envOverrides });
  }

  it("removes the .enabled marker file", async () => {
    await installAndEnable("turn-me-off");
    const markerPath = join(sandbox.pluginsRoot, "turn-me-off", ENABLED_MARKER);
    expect(existsSync(markerPath)).toBe(true);
    const r = await runPluginDisable(
      { name: "turn-me-off" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("disabled");
    expect(existsSync(markerPath)).toBe(false);
  });

  it("leaves plugin files intact after disabling", async () => {
    await installAndEnable("keep-files");
    await runPluginDisable(
      { name: "keep-files" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(
      existsSync(join(sandbox.pluginsRoot, "keep-files", "plugin.yaml")),
    ).toBe(true);
    expect(
      existsSync(join(sandbox.pluginsRoot, "keep-files", "README.md")),
    ).toBe(true);
  });

  it("is idempotent when plugin is already disabled", async () => {
    const source = writePluginSource(sandbox.cwd, "never-enabled");
    await runPluginAdd(
      { source, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    const r = await runPluginDisable(
      { name: "never-enabled" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("already-disabled");
  });

  it("returns exit 1 when the plugin is not installed", async () => {
    const r = await runPluginDisable(
      { name: "ghost-plugin" },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.action).toBe("missing");
  });
});
