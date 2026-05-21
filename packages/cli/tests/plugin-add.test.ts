import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runPluginAdd } from "../src/commands/plugin.js";
import {
  makeSandbox,
  writePluginSource,
  type Sandbox,
} from "./plugin-helpers.js";

describe("neurodock plugin add", () => {
  let sandbox: Sandbox;
  beforeEach(() => {
    sandbox = makeSandbox("neurodock-plugin-add-");
  });
  afterEach(() => sandbox.cleanup());

  it("installs a valid plugin into the plugins directory", async () => {
    const sourceDir = writePluginSource(sandbox.cwd, "test-plugin-one");
    const r = await runPluginAdd(
      { source: sourceDir, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("installed");
    expect(r.manifest?.name).toBe("test-plugin-one");
    const dest = join(sandbox.pluginsRoot, "test-plugin-one");
    expect(existsSync(join(dest, "plugin.yaml"))).toBe(true);
    expect(existsSync(join(dest, "README.md"))).toBe(true);
    expect(r.messages.join("\n")).toContain("restart your MCP client");
  });

  it("resolves a relative source path against the sandbox cwd", async () => {
    writePluginSource(sandbox.cwd, "relative-plugin");
    const r = await runPluginAdd(
      {
        source: "./relative-plugin",
        yes: true,
        dryRun: false,
        force: false,
      },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.resolvedSource).toBe(join(sandbox.cwd, "relative-plugin"));
    expect(
      existsSync(join(sandbox.pluginsRoot, "relative-plugin", "plugin.yaml")),
    ).toBe(true);
  });

  it("--dry-run writes nothing", async () => {
    const sourceDir = writePluginSource(sandbox.cwd, "dryrun-plugin");
    const r = await runPluginAdd(
      { source: sourceDir, yes: true, dryRun: true, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("dry-run");
    expect(existsSync(join(sandbox.pluginsRoot, "dryrun-plugin"))).toBe(false);
    expect(r.messages.join("\n")).toContain("Would install");
  });

  it("returns exit 1 when the source path does not exist", async () => {
    const r = await runPluginAdd(
      {
        source: join(sandbox.cwd, "does-not-exist"),
        yes: true,
        dryRun: false,
        force: false,
      },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.action).toBe("fail");
    expect(r.messages.join("\n")).toContain("does not exist");
  });

  it("returns exit 1 when the source directory has no plugin.yaml", async () => {
    const dir = join(sandbox.cwd, "empty-source");
    mkdirSync(dir, { recursive: true });
    const r = await runPluginAdd(
      { source: dir, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.action).toBe("fail");
    expect(r.messages.join("\n")).toContain("No plugin.yaml");
  });

  it("returns exit 3 when the manifest fails schema validation", async () => {
    const dir = join(sandbox.cwd, "bad-manifest");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "plugin.yaml"),
      "schema_version: '0.1.0'\nname: bad-manifest\n",
      "utf8",
    );
    const r = await runPluginAdd(
      { source: dir, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(3);
    expect(r.action).toBe("fail");
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it("refuses to overwrite an existing install without --force (--yes mode)", async () => {
    const sourceDir = writePluginSource(sandbox.cwd, "collide-plugin");
    const first = await runPluginAdd(
      { source: sourceDir, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(first.exitCode).toBe(0);

    const second = await runPluginAdd(
      { source: sourceDir, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(second.exitCode).toBe(2);
    expect(second.action).toBe("aborted");
    expect(second.messages.join("\n")).toContain("already installed");
  });

  it("--force overwrites an existing install", async () => {
    const sourceDir = writePluginSource(sandbox.cwd, "force-plugin");
    await runPluginAdd(
      { source: sourceDir, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    // Mutate the source to prove we actually overwrote.
    writeFileSync(join(sourceDir, "README.md"), "# force-plugin v2\n", "utf8");
    const r = await runPluginAdd(
      { source: sourceDir, yes: true, dryRun: false, force: true },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe("overwritten");
    const installedReadme = readFileSync(
      join(sandbox.pluginsRoot, "force-plugin", "README.md"),
      "utf8",
    );
    expect(installedReadme).toContain("v2");
  });

  it("prompts before overwrite when --yes is not passed", async () => {
    const sourceDir = writePluginSource(sandbox.cwd, "prompt-plugin");
    await runPluginAdd(
      { source: sourceDir, yes: true, dryRun: false, force: false },
      { envOverrides: sandbox.envOverrides },
    );
    let prompted = "";
    const r = await runPluginAdd(
      { source: sourceDir, yes: false, dryRun: false, force: false },
      {
        envOverrides: sandbox.envOverrides,
        confirm: async (msg) => {
          prompted = msg;
          return false;
        },
      },
    );
    expect(prompted).toContain("already installed");
    expect(r.exitCode).toBe(2);
    expect(r.action).toBe("aborted");
  });
});
