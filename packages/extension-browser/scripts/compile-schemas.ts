/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * compile-schemas.ts — Build-time AJV schema compilation for CSP-safe runtime.
 *
 * Chrome MV3 extensions enforce a strict CSP that forbids `unsafe-eval`.
 * `Ajv.compile(schema)` at runtime uses `new Function(generatedCode)` which
 * is `eval`, so every translation response was failing validation silently
 * before this fix (CSP threw `EvalError: Evaluating a string as JavaScript
 * violates the following Content Security Policy directive`).
 *
 * The fix is the canonical AJV CSP escape hatch: precompile the four
 * translation output schemas at build time via `ajv/dist/standalone` into
 * a regular ES module. Runtime imports the validator *functions* and never
 * touches `new Function`.
 *
 * The output module is committed to `src/lib/schemas/compiled-validators.js`
 * (in `.gitignore` — regenerated on every build). Strict tsc in WXT picks
 * it up via the matching `.d.ts` we emit alongside.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, "..");
const SCHEMAS_DIR = resolve(PKG_ROOT, "src", "lib", "schemas");
const OUTPUT_FILE = resolve(SCHEMAS_DIR, "compiled-validators.js");
const OUTPUT_TYPES = resolve(SCHEMAS_DIR, "compiled-validators.d.ts");

const TOOLS = [
  "translate_incoming",
  "check_tone",
  "rewrite_outgoing",
  "brief_meeting",
  "describe_image",
] as const;

type JsonSchema = Record<string, unknown>;

/**
 * Mirrors the runtime `buildOutputSchema` in validation.ts. The raw schema
 * wraps an `input` and `output` block; we lift `output` to root + carry
 * `$defs` so internal `$ref`s still resolve.
 */
function buildOutputSchema(raw: JsonSchema, tool: string): JsonSchema {
  const properties = (raw.properties ?? {}) as Record<string, unknown>;
  const output = (properties.output ?? {}) as JsonSchema;
  const defs = (raw.$defs ?? {}) as JsonSchema;
  return {
    $id: `https://neurodock.org/schemas/${tool}.output.json`,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...output,
    $defs: defs,
  };
}

/**
 * Replaces the single `require("ajv/dist/runtime/<name>")` call AJV
 * standalone emits with a top-level ES import + reference to the imported
 * binding. We hard-list the known runtime helpers — AJV only emits these
 * for the keywords we use (maxLength/minLength → ucs2length; equal → for
 * enum/const checks if we ever add them).
 *
 * If a future AJV version introduces a new runtime helper, the compile
 * step will fail loudly here rather than ship a broken bundle. That is
 * the correct trade-off; silent fallthrough is what broke 0.0.10.
 */
function rewriteAjvRuntimeRequires(source: string): string {
  const knownRuntimes: Record<string, string> = {
    ucs2length: "__ajvRuntimeUcs2length",
    equal: "__ajvRuntimeEqual",
    validateTime: "__ajvRuntimeValidateTime",
  };
  const imports: string[] = [];
  let out = source;
  const requireRe = /require\("ajv\/dist\/runtime\/([a-zA-Z0-9_]+)"\)/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = requireRe.exec(source)) !== null) {
    const name = m[1]!;
    const binding = knownRuntimes[name];
    if (!binding) {
      throw new Error(
        `compile-schemas: AJV standalone emitted require() for an ` +
          `unrecognised runtime helper "${name}". Add it to ` +
          `knownRuntimes in rewriteAjvRuntimeRequires.`,
      );
    }
    if (!seen.has(name)) {
      // Use namespace import so `.default` access in the generated code
      // (`require("…").default`) keeps resolving. Default-import would
      // unwrap the default and break `.default` references downstream.
      imports.push(
        `import * as ${binding} from "ajv/dist/runtime/${name}.js";`,
      );
      seen.add(name);
    }
  }
  out = out.replace(requireRe, (_full, name: string) => knownRuntimes[name]!);
  if (imports.length === 0) return source;
  // Standalone output starts with `"use strict";`. Insert imports right
  // after that pragma so the module still type-checks and stays ESM.
  const prefix = '"use strict";';
  if (out.startsWith(prefix)) {
    return prefix + imports.join("") + out.slice(prefix.length);
  }
  return imports.join("") + out;
}

function loadSchema(tool: string): JsonSchema {
  const path = join(SCHEMAS_DIR, `${tool}.schema.json`);
  if (!existsSync(path)) {
    throw new Error(
      `compile-schemas: ${path} missing. Run pnpm sync:schemas first.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as JsonSchema;
}

export function compileSchemas(): { written: string } {
  mkdirSync(SCHEMAS_DIR, { recursive: true });
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    code: { source: true, esm: true },
  });
  const refs: Record<string, string> = {};
  for (const tool of TOOLS) {
    const raw = loadSchema(tool);
    const wrapped = buildOutputSchema(raw, tool);
    ajv.addSchema(wrapped, tool);
    refs[`validate_${tool}`] = tool;
  }
  const rawModule = standaloneCode(ajv, refs);
  // Post-process: AJV standalone with `esm: true` still emits a single
  // CJS-style `require("ajv/dist/runtime/ucs2length")` for the maxLength
  // runtime helper (because `ucs2length` is a runtime, not codegen,
  // dependency). Chrome MV3 service workers don't define `require`, so
  // this throws `ReferenceError: require is not defined` at load time.
  // We rewrite the single call into a top-level ES import.
  const moduleSource = rewriteAjvRuntimeRequires(rawModule);
  writeFileSync(OUTPUT_FILE, moduleSource, "utf8");

  const types = [
    "// Auto-generated by scripts/compile-schemas.ts.",
    "// Do not edit; regenerated on every build.",
    "",
    "export type ValidateFn = ((data: unknown) => boolean) & {",
    "  errors?: ReadonlyArray<{",
    "    instancePath: string;",
    "    schemaPath: string;",
    "    keyword: string;",
    "    message?: string;",
    "    params: Record<string, unknown>;",
    "  }> | null;",
    "};",
    "",
    ...TOOLS.map((t) => `export const validate_${t}: ValidateFn;`),
    "",
  ].join("\n");
  writeFileSync(OUTPUT_TYPES, types, "utf8");

  return { written: OUTPUT_FILE };
}

// Always run when invoked directly. `tsx scripts/compile-schemas.ts` from the
// package root is the only invocation surface; we don't import this module
// elsewhere. The previous `import.meta.url === file://...` guard failed on
// Windows because path normalisation differs between Node and tsx.
try {
  const result = compileSchemas();
  console.log(`[compile-schemas] wrote ${result.written}`);
} catch (cause) {
  console.error("[compile-schemas] FAILED");
  console.error(cause);
  process.exit(1);
}
