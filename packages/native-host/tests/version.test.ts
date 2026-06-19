/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * The host version must track package.json — never a hardcoded literal.
 * Regression guard: the published host long reported "0.1.0" over ping and
 * `--version` while the package was already at 0.3.0, so users (and `doctor`)
 * saw a stale version that did not identify the build they were running.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { HOST_VERSION } from "../src/protocol.js";
import { main } from "../src/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(here, "..", "package.json"), "utf8"),
) as { version: string };

describe("HOST_VERSION", () => {
  it("matches the package.json version, not a hardcoded literal", () => {
    expect(HOST_VERSION).toBe(pkg.version);
  });

  it("is a non-empty semver-shaped string", () => {
    expect(HOST_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("neurodock-native-host --version", () => {
  it("prints the real package version", async () => {
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      });
    try {
      const code = await main(["--version"]);
      expect(code).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(writes.join("").trim()).toBe(pkg.version);
  });
});
