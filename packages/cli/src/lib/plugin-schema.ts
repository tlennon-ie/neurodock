/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export interface PluginValidationViolation {
  readonly path: string;
  readonly message: string;
  readonly keyword: string;
}

export interface PluginValidationResult {
  readonly valid: boolean;
  readonly violations: ReadonlyArray<PluginValidationViolation>;
}

let cachedSchema: object | null = null;
let cachedValidator: ReturnType<Ajv2020["compile"]> | null = null;

function resolveSchemaPath(): string {
  // Mirrors profile/validator.ts resolveSchemaPath() — try a few candidates so
  // the file works from dist/, src/ under vitest, and as a published bin.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "..", "..", "core", "schemas", "plugin.schema.json"),
    resolve(
      here,
      "..",
      "..",
      "..",
      "..",
      "core",
      "schemas",
      "plugin.schema.json",
    ),
    resolve(here, "..", "..", "core", "schemas", "plugin.schema.json"),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, "utf8");
      return c;
    } catch {
      // keep trying
    }
  }
  return join(
    process.cwd(),
    "packages",
    "core",
    "schemas",
    "plugin.schema.json",
  );
}

export function loadPluginSchema(): object {
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
  const addFormatsFn =
    (addFormats as unknown as (a: Ajv2020) => Ajv2020) ?? addFormats;
  addFormatsFn(ajv);
  cachedValidator = ajv.compile(loadPluginSchema());
  return cachedValidator;
}

export function validatePluginManifest(value: unknown): PluginValidationResult {
  const validate = getValidator();
  const ok = validate(value);
  if (ok) {
    return { valid: true, violations: [] };
  }
  const errors = validate.errors ?? [];
  const violations: PluginValidationViolation[] = errors.map((e) => {
    const instancePath = e.instancePath === "" ? "/" : e.instancePath;
    const path =
      e.keyword === "additionalProperties" &&
      typeof (e.params as Record<string, unknown>)["additionalProperty"] ===
        "string"
        ? `${instancePath}/${
            (e.params as Record<string, string>)["additionalProperty"] ?? ""
          }`
        : instancePath;
    return {
      path,
      message: e.message ?? "invalid",
      keyword: e.keyword,
    };
  });
  return { valid: false, violations };
}
