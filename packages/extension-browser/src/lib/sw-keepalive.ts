/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Service-worker keepalive helper.
 *
 * In Manifest V3, the extension service worker is killed after ~30s of
 * inactivity. "Inactivity" is measured by chrome.* API events — a
 * pending fetch() alone does NOT keep the worker alive in practice.
 *
 * This bites the right-click translate path on Gmail specifically: a
 * long email thread sent to a local LM Studio model can take 30–90s to
 * stream back. The SW is awaiting the streaming fetch, the LM Studio
 * server is happily producing tokens, but the SW gets terminated by
 * Chrome mid-flight. The HTTP fetch keeps going at the network layer,
 * LM Studio's progress bar reaches 100%, but the awaited Promise in
 * the SW never resolves because the SW context is gone. The result is
 * silently lost — no panel opens, no history row appears.
 *
 * GitHub PR comments (the comparison the user reported works) are
 * typically much shorter than email threads, so the translate finishes
 * within the 30s window and the SW survives.
 *
 * Fix: while a long-running operation is in flight, periodically call a
 * cheap chrome.* API (`chrome.runtime.getPlatformInfo`) every ~20s.
 * That counts as an event and resets the idle-kill timer.
 *
 * Pattern adapted from the documented Chromium workaround:
 *   https://issues.chromium.org/issues/40123712 (sw idle kill)
 *   https://stackoverflow.com/q/66618136 (manifest-v3-keep-alive)
 *
 * `withKeepalive(fn)` wraps any async operation. The ticker starts when
 * the operation starts and stops when it settles. Cheap when the
 * operation finishes quickly (one or zero ticks).
 */

const DEFAULT_INTERVAL_MS = 20_000;

export interface KeepaliveOptions {
  readonly intervalMs?: number;
  /**
   * Override the chrome.* API used to keep the SW alive. Allows tests
   * to assert the call without spinning real intervals.
   */
  readonly pingChrome?: () => void;
}

/**
 * Run `fn` while pinging a cheap chrome.* API every `intervalMs` to
 * defeat the MV3 service-worker idle kill. The ping stops as soon as
 * the operation settles (success OR failure).
 *
 * Safe in non-extension contexts (tests, node): if no chrome runtime is
 * available, the keepalive is a no-op and `fn` runs normally.
 */
export async function withKeepalive<T>(
  fn: () => Promise<T>,
  options: KeepaliveOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const ping = options.pingChrome ?? defaultPing;
  let timer: ReturnType<typeof setInterval> | null = null;
  if (ping !== noopPing) {
    // First tick immediately resets the idle counter — useful for
    // operations that take just over the 30s threshold.
    ping();
    timer = setInterval(ping, intervalMs);
  }
  try {
    return await fn();
  } finally {
    if (timer !== null) clearInterval(timer);
  }
}

function noopPing(): void {
  // intentional no-op
}

function defaultPing(): void {
  const g = globalThis as unknown as {
    chrome?: {
      runtime?: {
        getPlatformInfo?: (cb?: (info: unknown) => void) => unknown;
      };
    };
  };
  const api = g.chrome?.runtime?.getPlatformInfo;
  if (typeof api !== "function") return;
  try {
    // Fire and forget — we don't care about the result, only the side
    // effect of having called a chrome.* API.
    const maybePromise = api(() => {
      // Callback form (MV2 + some MV3 builds). Swallow errors.
      void chromeLastError();
    });
    // Promise form (MV3 in modern Chromium). Swallow errors.
    if (
      maybePromise &&
      typeof (maybePromise as { then?: unknown }).then === "function"
    ) {
      (maybePromise as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // chrome.runtime.getPlatformInfo can theoretically throw if the
    // worker is being torn down. Ignore — we already lost the race.
  }
}

function chromeLastError(): void {
  const g = globalThis as unknown as {
    chrome?: { runtime?: { lastError?: unknown } };
  };
  // Reading lastError clears it on the chrome side, preventing a
  // "Unchecked runtime.lastError" warning when the worker is being
  // torn down between scheduling and callback firing.
  void g.chrome?.runtime?.lastError;
}
