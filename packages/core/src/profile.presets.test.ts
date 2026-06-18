/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * profile.presets.test.ts — every curated preset under the repo-root
 * `profiles/` directory MUST validate against the canonical profile schema.
 * Presets are part of the public contract (ADR 0004): a preset that drifts
 * out of conformance is a user-facing breakage. This walks the directory so
 * a newly added preset is covered automatically.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { beforeAll, describe, expect, test } from "vitest";
import type { ValidateFunction } from "ajv";
import { buildAjv } from "./test-helpers/ajv.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const presetsDir = resolve(repoRoot, "profiles");

function readSchema(): object {
  const raw = readFileSync(
    resolve(here, "..", "schemas", "profile.schema.json"),
    "utf8",
  );
  return JSON.parse(raw) as object;
}

let validate: ValidateFunction;

beforeAll(() => {
  validate = buildAjv().compile(readSchema());
});

const presetFiles = readdirSync(presetsDir).filter((f) => f.endsWith(".yaml"));

describe("curated presets validate against the profile schema", () => {
  test("the profiles directory contains presets to check", () => {
    expect(presetFiles.length).toBeGreaterThan(0);
  });

  test.each(presetFiles)("%s is a valid profile", (file) => {
    const parsed = parseYaml(readFileSync(resolve(presetsDir, file), "utf8"));
    const ok = validate(parsed);
    if (!ok) {
      throw new Error(
        `${file} failed schema validation: ${JSON.stringify(
          validate.errors,
          null,
          2,
        )}`,
      );
    }
    expect(ok).toBe(true);
  });
});
