/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * neurotype-addenda.schema.test.ts — schema-conformance gate for the shared
 * neurotype-shaping artifact (data/neurotype-addenda/v1.json).
 *
 * Compiles the canonical schema (the exact file shipped in the package and
 * consumed at runtime by the assembler) with Ajv 2020 and asserts:
 *   - the shipped v1.json artifact validates clean against its schema;
 *   - the declared interpolation tokens are exactly {max_chunk_size} + {notes};
 *   - every neurotype named in `priority` has a `generic` fallback block;
 *   - a missing required top-level key is rejected (so the schema actually
 *     gates the shape, not just rubber-stamps anything).
 *
 * Ajv + ajv-formats are dev-only test dependencies. The package keeps its
 * zero-runtime-dependencies invariant.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import type { ValidateFunction } from "ajv";
import { buildAjv } from "./test-helpers/ajv.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(here, "..", "schemas");
const dataDir = resolve(here, "..", "data", "neurotype-addenda");

function readSchema(): object {
  const raw = readFileSync(
    resolve(schemasDir, "neurotype-addenda.schema.json"),
    "utf8",
  );
  return JSON.parse(raw) as object;
}

function readArtifact(): Record<string, unknown> {
  const raw = readFileSync(resolve(dataDir, "v1.json"), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

let validate: ValidateFunction;

beforeAll(() => {
  validate = buildAjv().compile(readSchema());
});

describe("neurotype-addenda schema — shipped artifact", () => {
  test("v1.json validates clean against the schema", () => {
    const ok = validate(readArtifact());
    if (!ok) {
      // Surface the first error to make a failure debuggable.
      throw new Error(JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  test("artifact_version is 1.0.0", () => {
    expect(readArtifact().artifact_version).toBe("1.0.0");
  });

  test("declares exactly the two interpolation tokens", () => {
    expect(readArtifact().tokens).toEqual(["{max_chunk_size}", "{notes}"]);
  });

  test("every neurotype in priority has a generic fallback or a special block", () => {
    const artifact = readArtifact();
    const priority = artifact.priority as readonly string[];
    const generic = artifact.generic as Record<string, unknown>;
    // tourette + other are special blocks, not generic entries.
    const specials = new Set(["tourette", "other"]);
    for (const neurotype of priority) {
      if (specials.has(neurotype)) {
        expect(artifact[neurotype]).toBeDefined();
      } else {
        expect(generic[neurotype]).toBeDefined();
      }
    }
  });
});

describe("neurotype-addenda schema — gating", () => {
  test("rejects an artifact missing a required top-level key", () => {
    const artifact = readArtifact();
    delete artifact.tools;
    expect(validate(artifact)).toBe(false);
  });

  test("rejects a non-array block", () => {
    const artifact = readArtifact();
    (artifact.voice_input as Record<string, unknown>).block = "not an array";
    expect(validate(artifact)).toBe(false);
  });
});
