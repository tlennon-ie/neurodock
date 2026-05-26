/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { existsSync, readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { LineCounter, parseDocument } from "yaml";
import { readEnv } from "../lib/env.js";
import { profilePath } from "../lib/paths.js";
import { loadSchema } from "../profile/validator.js";

export interface ValidateOptions {
  readonly file?: string;
  readonly strict: boolean;
}

export interface ValidateRunViolation {
  readonly path: string;
  readonly message: string;
  readonly keyword: string;
  readonly line?: number;
}

export interface ValidateRunResult {
  readonly resolvedPath: string;
  readonly missing: boolean;
  readonly parseError?: string;
  readonly valid: boolean;
  readonly violations: ReadonlyArray<ValidateRunViolation>;
}

export interface ValidateDependencies {
  readonly envOverrides?: Parameters<typeof readEnv>[0];
}

export async function runValidate(
  options: ValidateOptions,
  deps: ValidateDependencies = {},
): Promise<ValidateRunResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const resolvedPath =
    options.file !== undefined && options.file.trim().length > 0
      ? options.file
      : profilePath(env);

  if (!existsSync(resolvedPath)) {
    return {
      resolvedPath,
      missing: true,
      valid: false,
      violations: [
        {
          path: "/",
          message: "profile file does not exist",
          keyword: "missing",
        },
      ],
    };
  }

  const text = readFileSync(resolvedPath, "utf8");
  const lineCounter = new LineCounter();
  let parsed: unknown;
  try {
    const doc = parseDocument(text, { lineCounter });
    if (doc.errors.length > 0) {
      const first = doc.errors[0];
      const message = first?.message ?? "YAML parse error";
      return {
        resolvedPath,
        missing: false,
        parseError: message,
        valid: false,
        violations: [
          {
            path: "/",
            message,
            keyword: "parse",
            ...(first?.linePos?.[0]?.line !== undefined
              ? { line: first.linePos[0].line }
              : {}),
          },
        ],
      };
    }
    parsed = doc.toJS();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      resolvedPath,
      missing: false,
      parseError: message,
      valid: false,
      violations: [{ path: "/", message, keyword: "parse" }],
    };
  }

  const validator = buildValidator(options.strict);
  const ok = validator(parsed);
  if (ok) {
    return { resolvedPath, missing: false, valid: true, violations: [] };
  }
  const errors = validator.errors ?? [];
  const violations = errors.map((e) => {
    const instancePath = e.instancePath === "" ? "/" : e.instancePath;
    const path =
      e.keyword === "additionalProperties" &&
      typeof (e.params as Record<string, unknown>)["additionalProperty"] ===
        "string"
        ? `${instancePath}/${
            (e.params as Record<string, string>)["additionalProperty"] ?? ""
          }`
        : instancePath;
    const line = locateLine(text, instancePath, lineCounter);
    const out: ValidateRunViolation = {
      path,
      message: e.message ?? "invalid",
      keyword: e.keyword,
      ...(line !== undefined ? { line } : {}),
    };
    return out;
  });
  return { resolvedPath, missing: false, valid: false, violations };
}

type CompiledValidator = ReturnType<Ajv2020["compile"]>;

let cachedStrict: CompiledValidator | null = null;
let cachedLenient: CompiledValidator | null = null;

function buildValidator(strict: boolean): CompiledValidator {
  if (strict && cachedStrict) return cachedStrict;
  if (!strict && cachedLenient) return cachedLenient;

  const schema = JSON.parse(JSON.stringify(loadSchema())) as Record<
    string,
    unknown
  >;
  if (strict) forceAdditionalPropertiesFalse(schema);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  const addFormatsFn =
    (addFormats as unknown as (a: Ajv2020) => Ajv2020) ?? addFormats;
  addFormatsFn(ajv);
  const compiled = ajv.compile(schema);
  if (strict) cachedStrict = compiled;
  else cachedLenient = compiled;
  return compiled;
}

function forceAdditionalPropertiesFalse(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) forceAdditionalPropertiesFalse(item);
    return;
  }
  if (!isObject(node)) return;
  if (node["type"] === "object" || isObject(node["properties"])) {
    node["additionalProperties"] = false;
  }
  for (const value of Object.values(node)) {
    if (isObject(value) || Array.isArray(value)) {
      forceAdditionalPropertiesFalse(value);
    }
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function locateLine(
  source: string,
  instancePath: string,
  lineCounter: LineCounter,
): number | undefined {
  if (instancePath === "" || instancePath === "/") return undefined;
  const segments = instancePath
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (segments.length === 0) return undefined;
  try {
    const doc = parseDocument(source, { lineCounter });
    let node: unknown = doc.getIn(segments, true);
    if (node === undefined || node === null) {
      for (
        let depth = segments.length - 1;
        depth >= 1 && (node === undefined || node === null);
        depth -= 1
      ) {
        node = doc.getIn(segments.slice(0, depth), true);
      }
    }
    const range = (node as { range?: ReadonlyArray<number> } | null)?.range;
    if (!range || range.length === 0 || range[0] === undefined)
      return undefined;
    const pos = lineCounter.linePos(range[0]);
    return pos.line;
  } catch {
    return undefined;
  }
}

export function formatViolation(v: ValidateRunViolation, file: string): string {
  const loc = v.line !== undefined ? `${file}:${v.line}` : file;
  return `  ${loc} ${v.path} (${v.keyword}): ${v.message}`;
}
