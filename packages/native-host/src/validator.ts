/**
 * Validate profile payloads against `packages/core/schemas/profile.schema.json`.
 *
 * The schema is loaded from disk so the host and the CLI both read the
 * same source-of-truth file.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface ValidationViolation {
  readonly path: string;
  readonly message: string;
  readonly keyword: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly violations: ReadonlyArray<ValidationViolation>;
}

let cachedValidator: ReturnType<Ajv2020["compile"]> | null = null;

function resolveSchemaPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "..", "core", "schemas", "profile.schema.json"),
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
    resolve(
      process.cwd(),
      "packages",
      "core",
      "schemas",
      "profile.schema.json",
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function getValidator(): ReturnType<Ajv2020["compile"]> | null {
  if (cachedValidator) return cachedValidator;
  const path = resolveSchemaPath();
  if (!path) return null;
  const raw = readFileSync(path, "utf8");
  const schema = JSON.parse(raw) as object;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  const addFormatsFn =
    (addFormats as unknown as (a: Ajv2020) => Ajv2020) ?? addFormats;
  addFormatsFn(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

export function validateProfile(value: unknown): ValidationResult {
  const validate = getValidator();
  if (!validate) {
    return { valid: true, violations: [] };
  }
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
