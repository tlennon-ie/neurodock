/**
 * Read and write ~/.neurodock/profile.yaml from inside the native host.
 *
 * Cross-platform path resolution mirrors the CLI loader documented in
 * `packages/core/schemas/profile.schema.json`:
 *
 *   1. $NEURODOCK_PROFILE_PATH
 *   2. $XDG_CONFIG_HOME/neurodock/profile.yaml
 *   3. ~/.neurodock/profile.yaml
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse, parseDocument, stringify, type Document } from "yaml";

export interface ProfileIoEnv {
  readonly NEURODOCK_PROFILE_PATH?: string | undefined;
  readonly XDG_CONFIG_HOME?: string | undefined;
}

export interface ResolveOptions {
  readonly env?: ProfileIoEnv;
  readonly home?: string;
}

export function resolveProfilePath(opts: ResolveOptions = {}): string {
  const env = opts.env ?? process.env;
  const override = env.NEURODOCK_PROFILE_PATH;
  if (override && override.trim().length > 0) {
    return override;
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim().length > 0) {
    return join(xdg, "neurodock", "profile.yaml");
  }
  return join(opts.home ?? homedir(), ".neurodock", "profile.yaml");
}

export interface ReadResult {
  readonly path: string;
  readonly exists: boolean;
  readonly raw: unknown;
  readonly text: string;
}

export function readProfile(path: string): ReadResult {
  if (!existsSync(path)) {
    return { path, exists: false, raw: null, text: "" };
  }
  const text = readFileSync(path, "utf8");
  const raw = parse(text) as unknown;
  return { path, exists: true, raw, text };
}

export interface WriteResult {
  readonly path: string;
  readonly created: boolean;
  readonly bytesWritten: number;
}

/**
 * Write a profile YAML, preserving comments when the on-disk file already
 * exists by merging the new value into the parsed document.
 */
export function writeProfile(
  path: string,
  value: Record<string, unknown>,
): WriteResult {
  mkdirSync(dirname(path), { recursive: true });
  let text: string;
  let created = false;
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8");
    const doc = parseDocument(existing);
    mergeIntoDocument(doc, value);
    text = doc.toString();
  } else {
    created = true;
    text = stringify(value);
  }
  writeFileSync(path, text, "utf8");
  return { path, created, bytesWritten: Buffer.byteLength(text, "utf8") };
}

function mergeIntoDocument(
  doc: Document.Parsed,
  patch: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(patch)) {
    doc.set(key, value);
  }
}
