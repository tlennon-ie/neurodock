/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * `probeNativeHost` must be gated on the optional `nativeMessaging`
 * permission. Regression guard: the shipped extension never declared
 * `nativeMessaging`, so `chrome.runtime.connectNative` was `undefined` and
 * the probe silently returned "absent" without ever launching the host —
 * the reason "full NeuroDock" never connected for anyone.
 *
 * Contract:
 *   - non-interactive probe: proceeds only when the permission is already
 *     held (chrome.permissions.contains); never prompts; never touches
 *     connectNative otherwise.
 *   - interactive probe (the "Check again" gesture): calls
 *     chrome.permissions.request directly — an awaited contains() first
 *     would invalidate the user gesture in Firefox — then proceeds only if
 *     granted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { probeNativeHost } from "../../src/lib/native-host-client.js";

interface FakePort {
  postMessage(value: unknown): void;
  disconnect(): void;
  onMessage: { addListener(fn: (msg: unknown) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

/** A port that replies to a `ping` with a well-formed pong on a microtask. */
function makePingablePort(version: string): FakePort {
  const listeners: Array<(m: unknown) => void> = [];
  return {
    postMessage(value: unknown) {
      const msg = value as { id?: string; op?: string };
      if (msg.op !== "ping") return;
      const reply = {
        id: msg.id,
        ok: true,
        op: "ping",
        data: { pong: true, version },
        error: null,
        version,
      };
      queueMicrotask(() => listeners.forEach((l) => l(reply)));
    },
    disconnect() {},
    onMessage: {
      addListener: (fn) => {
        listeners.push(fn);
      },
    },
    onDisconnect: { addListener: () => {} },
  };
}

interface ChromeStub {
  connectNativeSpy: ReturnType<typeof vi.fn>;
  containsSpy: ReturnType<typeof vi.fn>;
  requestSpy: ReturnType<typeof vi.fn>;
}

function stubChrome(opts: {
  contains: boolean;
  request: boolean;
  port?: FakePort;
}): ChromeStub {
  const connectNativeSpy = vi.fn(() => opts.port ?? makePingablePort("0.0.0"));
  const containsSpy = vi.fn((_p: unknown, cb: (granted: boolean) => void) =>
    cb(opts.contains),
  );
  const requestSpy = vi.fn((_p: unknown, cb: (granted: boolean) => void) =>
    cb(opts.request),
  );
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { connectNative: connectNativeSpy, lastError: undefined },
    permissions: { contains: containsSpy, request: requestSpy },
  };
  return { connectNativeSpy, containsSpy, requestSpy };
}

describe("probeNativeHost permission gating", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it("non-interactive: returns absent and never connects when permission is not held", async () => {
    const { connectNativeSpy, requestSpy } = stubChrome({
      contains: false,
      request: true,
    });
    const hello = await probeNativeHost({ interactive: false });
    expect(hello.status).toBe("absent");
    expect(connectNativeSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("non-interactive: connects and pings when permission is already held", async () => {
    const { connectNativeSpy, requestSpy } = stubChrome({
      contains: true,
      request: false,
      port: makePingablePort("0.3.0"),
    });
    const hello = await probeNativeHost({ interactive: false });
    expect(hello.status).toBe("active");
    expect(hello.version).toBe("0.3.0");
    expect(connectNativeSpy).toHaveBeenCalledWith("com.neurodock.profile");
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("interactive: requests the permission (gesture-preserving) and connects when granted", async () => {
    const { connectNativeSpy, requestSpy, containsSpy } = stubChrome({
      contains: false,
      request: true,
      port: makePingablePort("0.3.0"),
    });
    const hello = await probeNativeHost({ interactive: true });
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0]?.[0]).toEqual({
      permissions: ["nativeMessaging"],
    });
    // Gesture preservation: request() is called directly, not gated behind
    // an awaited contains().
    expect(containsSpy).not.toHaveBeenCalled();
    expect(hello.status).toBe("active");
    expect(connectNativeSpy).toHaveBeenCalledWith("com.neurodock.profile");
  });

  it("interactive: returns absent and never connects when the user denies", async () => {
    const { connectNativeSpy, requestSpy } = stubChrome({
      contains: false,
      request: false,
    });
    const hello = await probeNativeHost({ interactive: true });
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(hello.status).toBe("absent");
    expect(connectNativeSpy).not.toHaveBeenCalled();
  });

  it("defaults to non-interactive when no options are passed", async () => {
    const { requestSpy } = stubChrome({ contains: false, request: true });
    const hello = await probeNativeHost();
    expect(hello.status).toBe("absent");
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
