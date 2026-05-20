import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runValidate } from "../src/commands/validate.js";

function makeSandbox(): { home: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "neurodock-validate-"));
  const home = join(root, "home");
  const cwd = join(root, "cwd");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  return {
    home,
    cwd,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

const VALID_PROFILE = `identity:
  display_name: tester
  neurotypes:
    - adhd
preferences:
  output_format: answer_first
  max_chunk_size: 7
`;

const INVALID_PROFILE = `identity:
  display_name: tester
  neurotypes:
    - not-a-real-neurotype
preferences:
  output_format: telepathy
`;

const FORWARD_COMPAT_PROFILE = `identity:
  display_name: tester
  neurotypes:
    - adhd
future_block:
  coming_in: v0.3.0
`;

describe("neurodock validate", () => {
  let sandbox: ReturnType<typeof makeSandbox>;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => sandbox.cleanup());

  it("returns valid for a good profile", async () => {
    const file = join(sandbox.home, "profile.yaml");
    writeFileSync(file, VALID_PROFILE, "utf8");
    const r = await runValidate(
      { file, strict: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.missing).toBe(false);
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect(r.resolvedPath).toBe(file);
  });

  it("reports violations with field paths for a bad profile", async () => {
    const file = join(sandbox.home, "profile.yaml");
    writeFileSync(file, INVALID_PROFILE, "utf8");
    const r = await runValidate(
      { file, strict: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.valid).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
    const paths = r.violations.map((v) => v.path);
    expect(
      paths.some(
        (p) => p.includes("neurotypes") || p.includes("output_format"),
      ),
    ).toBe(true);
    for (const v of r.violations) {
      expect(v.keyword.length).toBeGreaterThan(0);
    }
  });

  it("attaches a 1-based line number when violations come from a real source", async () => {
    const file = join(sandbox.home, "profile.yaml");
    writeFileSync(file, INVALID_PROFILE, "utf8");
    const r = await runValidate(
      { file, strict: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.valid).toBe(false);
    const withLine = r.violations.find((v) => v.line !== undefined);
    expect(withLine).toBeDefined();
    expect(withLine!.line!).toBeGreaterThan(0);
  });

  it("allows unknown keys by default (forward-compat)", async () => {
    const file = join(sandbox.home, "profile.yaml");
    writeFileSync(file, FORWARD_COMPAT_PROFILE, "utf8");
    const r = await runValidate(
      { file, strict: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.valid).toBe(true);
  });

  it("flags unknown keys when --strict", async () => {
    const file = join(sandbox.home, "profile.yaml");
    writeFileSync(file, FORWARD_COMPAT_PROFILE, "utf8");
    const r = await runValidate(
      { file, strict: true },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.valid).toBe(false);
    const additional = r.violations.find(
      (v) => v.keyword === "additionalProperties",
    );
    expect(additional).toBeDefined();
    expect(additional!.path).toContain("future_block");
  });

  it("returns missing=true when the profile file is absent", async () => {
    const file = join(sandbox.home, "missing.yaml");
    const r = await runValidate(
      { file, strict: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: {} as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.missing).toBe(true);
    expect(r.valid).toBe(false);
  });

  it("falls back to NEURODOCK_PROFILE_PATH when --file is not provided", async () => {
    const file = join(sandbox.home, "fallback.yaml");
    writeFileSync(file, VALID_PROFILE, "utf8");
    const r = await runValidate(
      { strict: false },
      {
        envOverrides: {
          platform: "linux",
          home: sandbox.home,
          cwd: sandbox.cwd,
          user: "tester",
          env: { NEURODOCK_PROFILE_PATH: file } as NodeJS.ProcessEnv,
        },
      },
    );
    expect(r.resolvedPath).toBe(file);
    expect(r.valid).toBe(true);
  });
});
