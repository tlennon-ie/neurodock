/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export interface ValidationViolation {
  readonly path: string;
  readonly message: string;
  readonly keyword: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly violations: ReadonlyArray<ValidationViolation>;
}

let cachedSchema: object | null = null;
let cachedValidator: ReturnType<Ajv2020["compile"]> | null = null;

function resolveSchemaPath(): string {
  // From dist/profile/validator.js → ../../../core/schemas/profile.schema.json
  // From src/profile/validator.ts in tests → same relative ancestry via vitest.
  const here = dirname(fileURLToPath(import.meta.url));
  // Published tarball location first (dist/assets/schemas/, populated by
  // scripts/copy-assets.mjs), then dev/workspace fall-backs.
  const candidates = [
    resolve(here, "..", "assets", "schemas", "profile.schema.json"),
    resolve(here, "..", "..", "..", "core", "schemas", "profile.schema.json"),
    resolve(
      here,
      "..",
      "..",
      "..",
      "..",
      "core",
      "schemas",
      "profile.schema.json",
    ),
    resolve(here, "..", "..", "core", "schemas", "profile.schema.json"),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, "utf8");
      return c;
    } catch {
      // keep trying
    }
  }
  // Last resort: workspace root from cwd.
  return join(
    process.cwd(),
    "packages",
    "core",
    "schemas",
    "profile.schema.json",
  );
}

export function loadSchema(): object {
  if (cachedSchema) return cachedSchema;
  const path = resolveSchemaPath();
  const raw = readFileSync(path, "utf8");
  cachedSchema = JSON.parse(raw) as object;
  return cachedSchema;
}

function getValidator(): ReturnType<Ajv2020["compile"]> {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  // ajv-formats default export typing varies between ESM/CJS interop.
  const addFormatsFn =
    (addFormats as unknown as (a: Ajv2020) => Ajv2020) ?? addFormats;
  addFormatsFn(ajv);
  cachedValidator = ajv.compile(loadSchema());
  return cachedValidator;
}

export function validateProfile(value: unknown): ValidationResult {
  const validate = getValidator();
  const ok = validate(value);
  if (ok) {
    return { valid: true, violations: [] };
  }
  const errors = validate.errors ?? [];
  const violations: ValidationViolation[] = errors.map((e) => ({
    path: e.instancePath === "" ? "/" : e.instancePath,
    message: e.message ?? "invalid",
    keyword: e.keyword,
  }));
  return { valid: false, violations };
}
