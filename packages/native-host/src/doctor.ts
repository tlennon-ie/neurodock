/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Live-launch verification: spawn the registered launcher exactly as Chrome
 * would and exchange a `ping`/pong over the length-prefixed stdio protocol.
 *
 * This is the check that would have caught all three shipped defects:
 *   - a manifest pointing at a deleted npx-cache file -> spawn fails;
 *   - a bare `.js` Chrome cannot launch on Windows -> spawn fails;
 *   - the host printing help instead of running -> no valid pong frame.
 *
 * `neurodock doctor` (CLI) and `neurodock-native-host doctor` (bin) both
 * call this against the launcher the registration wrote.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import {
  encodeMessage,
  tryDecodeMessage,
  HOST_VERSION,
  type HostResponse,
  type PingData,
} from "./protocol.js";

export interface VerifyOptions {
  /** Hard cap on the whole exchange. Defaults to 8s. */
  readonly timeoutMs?: number;
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly pong: boolean;
  readonly version: string | null;
  readonly detail?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Spawn `launcherPath` and exchange a single ping/pong. Resolves (never
 * rejects) with a structured result so callers can fold it into a check list.
 */
export function verifyLiveLaunch(
  launcherPath: string,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<VerifyResult>((resolve) => {
    if (!existsSync(launcherPath)) {
      resolve({
        ok: false,
        pong: false,
        version: null,
        detail: `Launcher not found at ${launcherPath}. Re-run 'neurodock host install'.`,
      });
      return;
    }

    let settled = false;
    const finish = (result: VerifyResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // already gone
      }
      resolve(result);
    };

    let child: ChildProcess;
    try {
      // Windows cannot CreateProcess a `.bat` directly — cmd.exe must
      // interpret it — so on win32 we go through the shell. On macOS/Linux the
      // launcher is a `0755` `#!/bin/sh` script: spawn it directly with
      // shell:false so no shell parses the path (removes any theoretical
      // shell-metachar concern about the launcher path).
      const useShell = process.platform === "win32";
      child = spawn(launcherPath, [], {
        stdio: ["pipe", "pipe", "ignore"],
        shell: useShell,
      });
    } catch (err) {
      finish({
        ok: false,
        pong: false,
        version: null,
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const timer = setTimeout(() => {
      finish({
        ok: false,
        pong: false,
        version: null,
        detail: `No response within ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    child.on("error", (err: Error) => {
      finish({
        ok: false,
        pong: false,
        version: null,
        detail: err.message,
      });
    });

    child.on("exit", (code) => {
      // We now close stdin right after the ping, so a healthy host pongs and
      // then exits 0 on EOF. The pong frame ('data') and the process 'exit'
      // can race, so defer the failure verdict by a tick to let any buffered
      // stdout drain and call finish() first. If a pong was already decoded,
      // `settled` makes this a no-op. A genuine no-protocol exit (e.g. the
      // host printed help and quit) still fails.
      setImmediate(() => {
        finish({
          ok: false,
          pong: false,
          version: null,
          detail: `Host exited (code ${
            code ?? "null"
          }) without a valid response.`,
        });
      });
    });

    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        let step;
        try {
          step = tryDecodeMessage(buffer);
        } catch (err) {
          finish({
            ok: false,
            pong: false,
            version: null,
            detail: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        if (!step) return;
        const response = step.message as HostResponse<PingData>;
        const data = response.data;
        const pong = response.ok === true && data != null && data.pong === true;
        finish({
          ok: pong,
          pong,
          version: data?.version ?? response.version ?? null,
          ...(pong
            ? {}
            : {
                detail: response.error ?? "Host did not return a valid pong.",
              }),
        });
      });
    }

    // Send the ping the moment the child is up, then close stdin. Ending
    // stdin exercises the host's clean stdin-EOF exit path (its `end` handler
    // does process.exit(0)) instead of relying solely on child.kill().
    try {
      const frame = encodeMessage({ op: "ping", id: "doctor" });
      child.stdin?.write(frame);
      child.stdin?.end();
    } catch (err) {
      finish({
        ok: false,
        pong: false,
        version: HOST_VERSION,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
