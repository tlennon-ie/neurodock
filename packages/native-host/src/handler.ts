/**
 * Pure request handler for the native messaging host.
 *
 * Filesystem access goes through the injected `io` adapter so the tests
 * can drive the protocol round-trip in memory.
 */
import type { HostRequest, HostResponse } from "./protocol.js";
import { HOST_VERSION, isHostRequest } from "./protocol.js";
import { validateProfile } from "./validator.js";

export interface ProfileIoAdapter {
  resolvePath(): string;
  read(path: string): { exists: boolean; raw: unknown; text: string };
  write(path: string, value: Record<string, unknown>): { created: boolean; bytesWritten: number };
}

function ok<T>(req: HostRequest, data: T): HostResponse<T> {
  return {
    ...(req.id !== undefined ? { id: req.id } : {}),
    ok: true,
    op: req.op,
    data,
    error: null,
    version: HOST_VERSION,
  };
}

function fail(req: HostRequest, code: string, message: string): HostResponse {
  return {
    ...(req.id !== undefined ? { id: req.id } : {}),
    ok: false,
    op: req.op,
    data: null,
    error: `${code}: ${message}`,
    version: HOST_VERSION,
  };
}

function failUnknown(rawId: string | undefined, message: string): HostResponse {
  return {
    ...(rawId !== undefined ? { id: rawId } : {}),
    ok: false,
    op: "unknown",
    data: null,
    error: message,
    version: HOST_VERSION,
  };
}

export interface GetResult {
  readonly path: string;
  readonly exists: boolean;
  readonly profile: unknown;
}

export interface SetResult {
  readonly path: string;
  readonly created: boolean;
  readonly bytesWritten: number;
}

export function handleRequest(raw: unknown, io: ProfileIoAdapter): HostResponse {
  if (!isHostRequest(raw)) {
    const id = isRecord(raw) && typeof raw["id"] === "string" ? raw["id"] : undefined;
    return failUnknown(id, "BAD_REQUEST: payload does not match {op, id?, payload?}");
  }
  const req: HostRequest = raw;

  if (req.op === "ping") {
    return ok(req, { pong: true, version: HOST_VERSION });
  }

  if (req.op === "get") {
    try {
      const path = io.resolvePath();
      const r = io.read(path);
      const result: GetResult = { path, exists: r.exists, profile: r.raw };
      return ok(req, result);
    } catch (err) {
      return fail(req, "READ_FAILED", err instanceof Error ? err.message : String(err));
    }
  }

  if (req.op === "set") {
    const payload = req.payload;
    if (!isRecord(payload)) {
      return fail(req, "BAD_PAYLOAD", "set requires a profile object as payload");
    }
    const validation = validateProfile(payload);
    if (!validation.valid) {
      const summary = validation.violations
        .slice(0, 5)
        .map((v) => `${v.path} (${v.keyword}): ${v.message}`)
        .join("; ");
      return fail(req, "SCHEMA_INVALID", summary || "profile failed schema validation");
    }
    try {
      const path = io.resolvePath();
      const existing = io.read(path);
      if (existing.exists && !req.confirmOverwrite) {
        if (!isTrivialChange(existing.raw, payload)) {
          return fail(
            req,
            "CONFIRM_REQUIRED",
            "on-disk profile differs from extension; resend with confirmOverwrite: true",
          );
        }
      }
      const w = io.write(path, payload);
      const result: SetResult = { path, created: w.created, bytesWritten: w.bytesWritten };
      return ok(req, result);
    } catch (err) {
      return fail(req, "WRITE_FAILED", err instanceof Error ? err.message : String(err));
    }
  }

  return fail(req, "UNKNOWN_OP", `Unsupported op: ${req.op as string}`);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * A change is "trivial" when the new payload sets only fields the extension
 * owns. Everything else requires explicit overwrite confirmation so we never
 * silently clobber profile.yaml fields the user edited by hand.
 */
const EXTENSION_OWNED_TOP_LEVEL = new Set(["identity"]);

export function isTrivialChange(existing: unknown, next: Record<string, unknown>): boolean {
  if (!isRecord(existing)) return true;
  for (const key of Object.keys(existing)) {
    if (EXTENSION_OWNED_TOP_LEVEL.has(key)) continue;
    if (!(key in next)) return false;
    if (!deepEqual(existing[key], next[key])) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
