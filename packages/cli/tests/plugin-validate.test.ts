import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPluginValidate } from "../src/commands/plugin.js";
import {
  makeSandbox,
  writePluginSource,
  type Sandbox,
} from "./plugin-helpers.js";

describe("neurodock plugin validate", () => {
  let sandbox: Sandbox;
  beforeEach(() => {
    sandbox = makeSandbox("neurodock-plugin-validate-");
  });
  afterEach(() => sandbox.cleanup());

  it("returns exit 0 for a valid plugin manifest", async () => {
    const dir = writePluginSource(sandbox.cwd, "good-plugin");
    const r = await runPluginValidate(
      { source: dir, json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    expect(r.valid).toBe(true);
    expect(r.manifest?.name).toBe("good-plugin");
    expect(r.messages.join("\n")).toContain("Valid:");
  });

  it("returns exit 2 when plugin.yaml is missing", async () => {
    const dir = join(sandbox.cwd, "no-manifest");
    mkdirSync(dir, { recursive: true });
    const r = await runPluginValidate(
      { source: dir, json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(2);
    expect(r.missing).toBe(true);
    expect(r.messages.join("\n")).toContain("Missing");
  });

  it("returns exit 2 when the source directory does not exist", async () => {
    const r = await runPluginValidate(
      { source: join(sandbox.cwd, "nowhere"), json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(2);
    expect(r.missing).toBe(true);
  });

  it("returns exit 1 when a required field is missing", async () => {
    const dir = join(sandbox.cwd, "missing-required");
    mkdirSync(dir, { recursive: true });
    // No `trust`, no `license`, etc.
    writeFileSync(
      join(dir, "plugin.yaml"),
      "schema_version: '0.1.0'\nname: missing-required\ntype: skill\nversion: '0.1.0'\ndescription: 'missing trust+license fields, should fail schema'\n",
      "utf8",
    );
    const r = await runPluginValidate(
      { source: dir, json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.valid).toBe(false);
    const requiredViolation = r.violations.find(
      (v) => v.keyword === "required",
    );
    expect(requiredViolation).toBeDefined();
  });

  it("returns exit 1 when a field has the wrong type", async () => {
    const dir = writePluginSource(sandbox.cwd, "wrong-type-plugin", {
      // `neurotypes` must be an array — pass a string.
      neurotypes: "not-an-array",
    });
    const r = await runPluginValidate(
      { source: dir, json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.valid).toBe(false);
    const typeViolation = r.violations.find((v) => v.keyword === "type");
    expect(typeViolation).toBeDefined();
  });

  it("returns exit 1 when an enum value is not allowed", async () => {
    // The license must be in the SPDX whitelist; submit a banned one.
    const dir = writePluginSource(sandbox.cwd, "bad-license-plugin", {
      license: "WTFPL",
    });
    const r = await runPluginValidate(
      { source: dir, json: false },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    expect(r.valid).toBe(false);
    const enumViolation = r.violations.find((v) => v.keyword === "enum");
    expect(enumViolation).toBeDefined();
  });

  it("--json emits machine-readable success output", async () => {
    const dir = writePluginSource(sandbox.cwd, "json-plugin");
    const r = await runPluginValidate(
      { source: dir, json: true },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(0);
    const payload = JSON.parse(r.messages[0]!) as Record<string, unknown>;
    expect(payload["valid"]).toBe(true);
    expect((payload["manifest"] as Record<string, unknown>)["name"]).toBe(
      "json-plugin",
    );
  });

  it("--json emits machine-readable failure output", async () => {
    const dir = writePluginSource(sandbox.cwd, "json-bad-plugin", {
      license: "NOT-A-REAL-LICENSE",
    });
    const r = await runPluginValidate(
      { source: dir, json: true },
      { envOverrides: sandbox.envOverrides },
    );
    expect(r.exitCode).toBe(1);
    const payload = JSON.parse(r.messages[0]!) as Record<string, unknown>;
    expect(payload["valid"]).toBe(false);
    expect(Array.isArray(payload["violations"])).toBe(true);
  });
});
