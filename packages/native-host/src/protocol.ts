/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Chrome Native Messaging protocol primitives.
 *
 * Wire shape: a 32-bit little-endian unsigned length prefix followed by a
 * UTF-8 JSON payload. Chrome enforces a 1 MB maximum message size.
 *
 * https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
 */

export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const LENGTH_PREFIX_BYTES = 4;

export type HostOp = "get" | "set" | "ping";

export interface HostRequest {
  readonly id?: string;
  readonly op: HostOp;
  readonly payload?: unknown;
  readonly confirmOverwrite?: boolean;
}

export interface HostResponse<T = unknown> {
  readonly id?: string;
  readonly ok: boolean;
  readonly op: HostOp | "unknown";
  readonly data: T | null;
  readonly error: string | null;
  readonly version: string;
}

import { createRequire } from "node:module";

/**
 * The host version, sourced from package.json — never a hardcoded literal.
 *
 * Two runtime shapes resolve it:
 *   - The bundled host (`dist/cli.js`, what Chrome launches): esbuild replaces
 *     `__NEURODOCK_HOST_VERSION__` with the package version at build time (see
 *     `scripts/bundle-cli.mjs`). The bundle is STAGED into a per-user dir whose
 *     only package.json is a `{"type":"module"}` shim, so the version must be
 *     baked in at build time — a runtime read would find no version there.
 *   - dev / tests (tsc / vitest): the define is absent, so read package.json
 *     next to the package root via createRequire.
 */
declare const __NEURODOCK_HOST_VERSION__: string | undefined;

function resolveHostVersion(): string {
  if (typeof __NEURODOCK_HOST_VERSION__ === "string") {
    return __NEURODOCK_HOST_VERSION__;
  }
  try {
    const nodeRequire = createRequire(import.meta.url);
    const pkg = nodeRequire("../package.json") as { version?: string };
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    /* fall through to the dev sentinel below */
  }
  return "0.0.0-dev";
}

export const HOST_VERSION: string = resolveHostVersion();

/**
 * Capability flags reported by the `ping` op — the "fully set up"
 * contract the browser extension's power-up card consumes. Additive to
 * the original `{ pong, version }` ping data: clients that ignore
 * `capabilities` keep working unchanged.
 */
export interface SetupCapabilities {
  /**
   * The host can read/write profile.yaml. Always true when the host is
   * responding at all — a ping reply is itself the proof.
   */
  readonly profile: true;
  /**
   * The proactive-guardrail hooks appear installed: NeuroDock hook
   * entries are present in `~/.claude/settings.json` (written by
   * `neurodock install-hooks` / `neurodock setup`).
   */
  readonly hooks: boolean;
  /**
   * The standalone guardrail daemon appears installed: its user-login
   * autostart marker exists (HKCU Run value on Windows, LaunchAgent
   * plist on macOS, systemd --user unit on Linux — written by
   * `neurodock install-hooks --install-daemon` / `neurodock setup
   * --daemon`).
   */
  readonly daemon: boolean;
}

/** Shape of `HostResponse.data` for a successful `ping`. */
export interface PingData {
  readonly pong: true;
  readonly version: string;
  readonly capabilities: SetupCapabilities;
}

export class ProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ProtocolError";
  }
}

/**
 * Encode a JSON-serialisable value as a length-prefixed Native Messaging frame.
 * Throws ProtocolError if the encoded payload exceeds the 1 MB Chrome cap.
 */
export function encodeMessage(value: unknown): Buffer {
  const json = JSON.stringify(value);
  const payload = Buffer.from(json, "utf8");
  if (payload.byteLength > MAX_MESSAGE_BYTES) {
    throw new ProtocolError(
      "MESSAGE_TOO_LARGE",
      `Encoded message is ${payload.byteLength} bytes; Chrome native messaging cap is ${MAX_MESSAGE_BYTES}.`,
    );
  }
  const prefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
  prefix.writeUInt32LE(payload.byteLength, 0);
  return Buffer.concat([prefix, payload]);
}

export interface DecodeStep {
  readonly message: unknown;
  readonly rest: Buffer;
}

/**
 * Attempt to peel one length-prefixed JSON message off the front of `buffer`.
 * Returns null when more bytes are needed. Throws ProtocolError on a clearly
 * malformed payload (oversized length, non-JSON body).
 */
export function tryDecodeMessage(buffer: Buffer): DecodeStep | null {
  if (buffer.byteLength < LENGTH_PREFIX_BYTES) {
    return null;
  }
  const length = buffer.readUInt32LE(0);
  if (length > MAX_MESSAGE_BYTES) {
    throw new ProtocolError(
      "MESSAGE_TOO_LARGE",
      `Incoming message announces ${length} bytes; cap is ${MAX_MESSAGE_BYTES}.`,
    );
  }
  const total = LENGTH_PREFIX_BYTES + length;
  if (buffer.byteLength < total) {
    return null;
  }
  const payload = buffer.subarray(LENGTH_PREFIX_BYTES, total).toString("utf8");
  const rest = buffer.subarray(total);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ProtocolError(
      "INVALID_JSON",
      `Frame body is not valid JSON: ${message}`,
    );
  }
  return { message: parsed, rest };
}

export function isHostRequest(value: unknown): value is HostRequest {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v["op"] !== "string") return false;
  if (v["op"] !== "get" && v["op"] !== "set" && v["op"] !== "ping")
    return false;
  if (v["id"] !== undefined && typeof v["id"] !== "string") return false;
  if (
    v["confirmOverwrite"] !== undefined &&
    typeof v["confirmOverwrite"] !== "boolean"
  ) {
    return false;
  }
  return true;
}
