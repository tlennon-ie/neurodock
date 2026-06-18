/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { version } from "./index";

const here = dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  const raw = readFileSync(resolve(here, "..", "package.json"), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

describe("@neurodock/core", () => {
  test("exports a version constant", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  // Version-drift guard: `changeset version` bumps package.json but cannot touch
  // the hand-written `version` constant in src/index.ts. This asserts the two
  // stay joined, so a release that forgets to bump the constant fails CI here
  // instead of shipping a mismatch. (We assert against package.json read at
  // runtime rather than deriving the constant from it, to keep src/index.ts a
  // plain `tsc` build with no JSON import escaping rootDir.)
  test("exported version matches package.json", () => {
    expect(version).toBe(readPackageVersion());
  });
});
