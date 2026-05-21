import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  runPluginAdd,
  runPluginEnable,
  runPluginList,
} from "../src/commands/plugin.js";
import {
  makeSandbox,
  writePluginSource,
  type Sandbox,
} from "./plugin-helpers.js";

describe("neurodock plugin list", () => {
  let sandbox: Sandbox;
  beforeEach(() => {
    sandbox = makeSandbox("neurodock-plugin-list-");
  });
  afterEach(() => sandbox.cleanup());

  it("reports no plugins when the plugins root does not exist", async () => {
    const r = await runPluginList(
      { json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.plugins).toHaveLength(0);
    expect(r.messages.join("\n")).toContain("No plugins installed");
  });

  it("lists installed plugins with their enabled state", async () => {
    const s1 = writePluginSource(sandbox.cwd, "plugin-aaa");
    const s2 = writePluginSource(sandbox.cwd, "plugin-bbb");
    await runPluginAdd(
      { source: s1, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    await runPluginAdd(
      { source: s2, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    await runPluginEnable(
      { name: "plugin-aaa" },
      { envOverrides: sandbox.envOverrides },
    );

    const r = await runPluginList(
      { json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.plugins).toHaveLength(2);
    const aaa = r.plugins.find((p) => p.name === "plugin-aaa");
    const bbb = r.plugins.find((p) => p.name === "plugin-bbb");
    expect(aaa?.enabled).toBe(true);
    expect(bbb?.enabled).toBe(false);
    expect(aaa?.manifest?.type).toBe("skill");
  });

  it("--json output is valid JSON with the expected shape", async () => {
    const src = writePluginSource(sandbox.cwd, "json-list-plugin");
    await runPluginAdd(
      { source: src, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    const r = await runPluginList(
      { json: true },
      { envOverrides: sandbox.envOverrides },
    );
    const payload = JSON.parse(r.messages[0]!) as {
      root: string;
      plugins: ReadonlyArray<{
        name: string;
        enabled: boolean;
        invalid: boolean;
        manifest?: { name: string; type: string; version: string };
      }>;
    };
    expect(payload.plugins).toHaveLength(1);
    expect(payload.plugins[0]?.name).toBe("json-list-plugin");
    expect(payload.plugins[0]?.enabled).toBe(false);
    expect(payload.plugins[0]?.manifest?.type).toBe("skill");
  });

  it("flags invalid installs without crashing", async () => {
    // Hand-craft a plugin directory with a broken manifest under the plugins root.
    const broken = writePluginSource(sandbox.cwd, "broken-plugin", {
      license: "NOT-A-VALID-LICENSE",
    });
    // Force the add to bypass schema validation by direct copy:
    // Instead we add it normally and expect failure, then drop the
    // directory manually via writePluginSource directly into the plugins root.
    void broken;
    writePluginSource(sandbox.pluginsRoot, "manually-broken", {
      license: "NOT-A-VALID-LICENSE",
    });
    const r = await runPluginList(
      { json: false },
      { envOverrides: sandbox.envOverrides },
    );
    const entry = r.plugins.find((p) => p.name === "manually-broken");
    expect(entry?.invalid).toBe(true);
    expect(entry?.manifest).toBeNull();
    expect(r.messages.join("\n")).toContain("invalid manifest");
  });
});
