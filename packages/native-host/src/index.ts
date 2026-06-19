#!/usr/bin/env node
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * NeuroDock Native Messaging host entry point.
 *
 * Launched by Chrome (or Chromium-derivative browsers) when the extension
 * calls `chrome.runtime.connectNative('com.neurodock.profile')`. Lives for
 * the lifetime of the single port the extension opens; exits when stdin
 * closes. Does not run as a daemon.
 *
 * Wire protocol: see src/protocol.ts.
 */
import { handleRequest, type ProfileIoAdapter } from "./handler.js";
import {
  encodeMessage,
  tryDecodeMessage,
  ProtocolError,
  HOST_VERSION,
} from "./protocol.js";
import { readProfile, resolveProfilePath, writeProfile } from "./profile-io.js";

const liveIo: ProfileIoAdapter = {
  resolvePath: () => resolveProfilePath(),
  read: (path) => readProfile(path),
  write: (path, value) => writeProfile(path, value),
};

export function runHost(io: ProfileIoAdapter = liveIo): void {
  // Buffer<ArrayBufferLike> rather than the default Buffer<ArrayBuffer> so
  // both Buffer.alloc and Buffer.concat assign cleanly under TS 5.7's
  // stricter Buffer typings.
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  const writeFrame = (value: unknown): void => {
    try {
      const frame = encodeMessage(value);
      process.stdout.write(frame);
    } catch (err) {
      const fallback = {
        ok: false,
        op: "unknown",
        data: null,
        error: err instanceof Error ? err.message : String(err),
        version: HOST_VERSION,
      };
      try {
        process.stdout.write(encodeMessage(fallback));
      } catch {
        process.exit(1);
      }
    }
  };

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.byteLength > 0) {
      let step;
      try {
        step = tryDecodeMessage(buffer);
      } catch (err) {
        if (err instanceof ProtocolError) {
          writeFrame({
            ok: false,
            op: "unknown",
            data: null,
            error: `${err.code}: ${err.message}`,
            version: HOST_VERSION,
          });
          buffer = Buffer.alloc(0);
          break;
        }
        throw err;
      }
      if (!step) break;
      buffer = step.rest;
      const response = handleRequest(step.message, io);
      writeFrame(response);
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });

  process.stdin.on("error", () => {
    process.exit(1);
  });
}

const invokedFromCli =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("index.js") ||
    process.argv[1].endsWith("neurodock-native-host"));

if (invokedFromCli) {
  runHost();
}

export { handleRequest } from "./handler.js";
export { detectCapabilities } from "./capabilities.js";
export type { CapabilityProbeDeps } from "./capabilities.js";
export { encodeMessage, tryDecodeMessage, HOST_VERSION } from "./protocol.js";
export { resolveProfilePath, readProfile, writeProfile } from "./profile-io.js";
export { verifyLiveLaunch } from "./doctor.js";
export type { VerifyOptions, VerifyResult } from "./doctor.js";
export type {
  HostRequest,
  HostResponse,
  PingData,
  SetupCapabilities,
} from "./protocol.js";
