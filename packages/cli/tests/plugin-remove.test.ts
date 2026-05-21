import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runPluginAdd, runPluginRemove } from "../src/commands/plugin.js";
import {
  makeSandbox,
  writePluginSource,
  type Sandbox,
} from "./plugin-helpers.js";

describe("neurodock plugin remove", () => {
  let sandbox: Sandbox;
  beforeEach(() => {
    sandbox = makeSandbox("neurodock-plugin-remove-");
  });
  afterEach(() => sandbox.cleanup());

  async function install(name: string): Promise<void> {
    const source = writePluginSource(sandbox.cwd, name);
    await runPluginAdd(
      { source, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
  }

  it("removes an installed plugin from disk", async () => {
    await install("removable");
    const dest = join(sandbox.pluginsRoot, "removable");
    expect(existsSync(dest)).toBe(true);
    const r = await runPluginRemove(
      { name: "removable", yes: true, dryRun: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("removed");
    expect(existsSync(dest)).toBe(false);
  });

  it("--dry-run reports the destination but does not delete", async () => {
    await install("dry-remove");
    const dest = join(sandbox.pluginsRoot, "dry-remove");
    const r = await runPluginRemove(
      { name: "dry-remove", yes: true, dryRun: true },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("dry-run");
    expect(existsSync(dest)).toBe(true);
    expect(r.messages.join("\n")).toContain("Would remove");
  });

  it("returns exit 1 when the plugin is not installed", async () => {
    const r = await runPluginRemove(
      { name: "nope", yes: true, dryRun: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.action).toBe("missing");
  });

  it("prompts before removing when --yes is not passed", async () => {
    await install("prompt-remove");
    let prompted = "";
    const r = await runPluginRemove(
      { name: "prompt-remove", yes: false, dryRun: false },
      {
        envOverrides: sandbox.envOverrides,
        confirm: async (msg) => {
          prompted = msg;
          return false;
        },
      },
    );
    expect(prompted).toContain("prompt-remove");
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("aborted");
    expect(existsSync(join(sandbox.pluginsRoot, "prompt-remove"))).toBe(true);
  });
});
