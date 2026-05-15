import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { parse, parseDocument, stringify, type Document } from "yaml";
import { applyDefaults } from "./defaults.js";

export interface LoadedProfile {
  readonly path: string;
  readonly raw: unknown;
  readonly resolved: Record<string, unknown>;
  readonly text: string;
}

export function loadProfileFromFile(path: string): LoadedProfile {
  const text = readFileSync(path, "utf8");
  return parseProfileText(path, text);
}

export function parseProfileText(path: string, text: string): LoadedProfile {
  const raw = parse(text) as unknown;
  const resolved = applyDefaults(raw);
  return { path, raw, resolved, text };
}

export function profileExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Read a comment-preserving YAML Document so a future write of the user's
 * profile.yaml can be round-tripped without losing comments (ADR 0004 §14).
 */
export function loadProfileDocument(path: string): Document.Parsed {
  const text = readFileSync(path, "utf8");
  return parseDocument(text);
}

export interface WriteProfileFromTemplateInput {
  readonly templatePath: string;
  readonly targetPath: string;
  readonly displayName: string;
}

export function writeProfileFromTemplate(input: WriteProfileFromTemplateInput): string {
  const templateText = readFileSync(input.templatePath, "utf8");
  const doc = parseDocument(templateText);
  // Set identity.display_name. parseDocument preserves comments and ordering.
  const identity = doc.get("identity");
  if (identity && typeof identity === "object" && "set" in (identity as object)) {
    (identity as { set: (k: string, v: unknown) => void }).set("display_name", input.displayName);
  } else {
    // Fallback: re-parse, mutate the plain object, re-stringify (loses comments
    // but only triggers if template is malformed, which we control).
    const plain = parse(templateText) as Record<string, unknown>;
    const ident = (plain["identity"] as Record<string, unknown>) ?? {};
    ident["display_name"] = input.displayName;
    plain["identity"] = ident;
    mkdirSync(dirname(input.targetPath), { recursive: true });
    writeFileSync(input.targetPath, stringify(plain), "utf8");
    return stringify(plain);
  }
  const text = doc.toString();
  mkdirSync(dirname(input.targetPath), { recursive: true });
  writeFileSync(input.targetPath, text, "utf8");
  return text;
}

export function renderResolvedYaml(resolved: Record<string, unknown>): string {
  return stringify(resolved);
}
