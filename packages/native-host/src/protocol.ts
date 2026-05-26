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

export const HOST_VERSION = "0.1.0";

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
