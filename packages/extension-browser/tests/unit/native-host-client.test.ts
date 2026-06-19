/**
 * Native messaging client unit tests.
 *
 * We mock the Chrome `runtime.connectNative` surface with an in-memory
 * port. The port plays the role of `@neurodock/native-host` and replies
 * with structured JSON the moment a message is posted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  probeNativeHost,
  nativeHostGetProfile,
  nativeHostSetProfile,
} from "../../src/lib/native-host-client.js";

type Listener<T> = (msg: T) => void;

interface FakePort {
  postMessage(value: unknown): void;
  disconnect(): void;
  onMessage: { addListener(fn: Listener<unknown>): void };
  onDisconnect: { addListener(fn: () => void): void };
}

interface FakeHostState {
  profile: unknown;
  exists: boolean;
}

function installFakeRuntime(
  state: FakeHostState,
  opts: { failConnect?: boolean } = {},
): () => void {
  const original = (globalThis as unknown as { chrome?: unknown }).chrome;
  let messageListener: Listener<unknown> | null = null;
  let disconnectListener: (() => void) | null = null;
  const port: FakePort = {
    postMessage(value) {
      const v = value as {
        id?: string;
        op: string;
        payload?: unknown;
        confirmOverwrite?: boolean;
      };
      // Reply asynchronously to simulate native messaging cadence.
      queueMicrotask(() => {
        if (!messageListener) return;
        const id = v.id;
        if (v.op === "ping") {
          messageListener({
            ...(id !== undefined ? { id } : {}),
            ok: true,
            op: "ping",
            data: { pong: true, version: "0.1.0" },
            error: null,
            version: "0.1.0",
          });
        } else if (v.op === "get") {
          messageListener({
            ...(id !== undefined ? { id } : {}),
            ok: true,
            op: "get",
            data: {
              path: "/tmp/profile.yaml",
              exists: state.exists,
              profile: state.profile,
            },
            error: null,
            version: "0.1.0",
          });
        } else if (v.op === "set") {
          if (state.exists && !v.confirmOverwrite) {
            messageListener({
              ...(id !== undefined ? { id } : {}),
              ok: false,
              op: "set",
              data: null,
              error: "CONFIRM_REQUIRED: differs",
              version: "0.1.0",
            });
          } else {
            state.profile = v.payload;
            state.exists = true;
            messageListener({
              ...(id !== undefined ? { id } : {}),
              ok: true,
              op: "set",
              data: {
                path: "/tmp/profile.yaml",
                created: true,
                bytesWritten: 64,
              },
              error: null,
              version: "0.1.0",
            });
          }
        }
      });
    },
    disconnect() {
      if (disconnectListener) disconnectListener();
    },
    onMessage: {
      addListener: (fn) => {
        messageListener = fn;
      },
    },
    onDisconnect: {
      addListener: (fn) => {
        disconnectListener = fn;
      },
    },
  };

  const fakeChrome = {
    runtime: {
      connectNative(_name: string): FakePort {
        if (opts.failConnect) {
          throw new Error("native host not registered");
        }
        return port;
      },
      lastError: undefined as { message?: string } | undefined,
    },
    // probeNativeHost is gated on the optional `nativeMessaging` permission.
    // These existing tests exercise the post-permission path, so grant it.
    permissions: {
      contains: (_p: unknown, cb: (granted: boolean) => void) => cb(true),
      request: (_p: unknown, cb: (granted: boolean) => void) => cb(true),
    },
  };
  (globalThis as unknown as { chrome?: unknown }).chrome = fakeChrome;
  return () => {
    (globalThis as unknown as { chrome?: unknown }).chrome = original;
  };
}

describe("native-host-client", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it("probes the host and reports active when ping succeeds", async () => {
    restore = installFakeRuntime({ profile: null, exists: false });
    const r = await probeNativeHost();
    expect(r.status).toBe("active");
    expect(r.version).toBe("0.1.0");
  });

  it("returns absent when connectNative is unavailable", async () => {
    const original = (globalThis as unknown as { chrome?: unknown }).chrome;
    (globalThis as unknown as { chrome?: unknown }).chrome = {};
    try {
      const r = await probeNativeHost();
      expect(r.status).toBe("absent");
    } finally {
      (globalThis as unknown as { chrome?: unknown }).chrome = original;
    }
  });

  it("returns absent when connectNative throws", async () => {
    restore = installFakeRuntime(
      { profile: null, exists: false },
      { failConnect: true },
    );
    const r = await probeNativeHost();
    expect(r.status).toBe("absent");
  });

  it("returns the on-disk profile via get", async () => {
    restore = installFakeRuntime({
      profile: { identity: { display_name: "T", neurotypes: ["adhd"] } },
      exists: true,
    });
    const r = await nativeHostGetProfile();
    expect(r).not.toBeNull();
    expect(r?.exists).toBe(true);
    expect(r?.path).toBe("/tmp/profile.yaml");
  });

  it("writes through set when no conflict exists", async () => {
    restore = installFakeRuntime({ profile: null, exists: false });
    const r = await nativeHostSetProfile({
      identity: { display_name: "T", neurotypes: [] },
    });
    expect(r.ok).toBe(true);
    expect(r.result?.created).toBe(true);
  });

  it("surfaces confirmRequired when the host refuses the overwrite", async () => {
    restore = installFakeRuntime({
      profile: { identity: { display_name: "T", neurotypes: ["adhd"] } },
      exists: true,
    });
    const r = await nativeHostSetProfile({
      identity: { display_name: "Alex", neurotypes: [] },
    });
    expect(r.ok).toBe(false);
    expect(r.confirmRequired).toBe(true);
  });

  it("retries with confirmOverwrite and succeeds", async () => {
    restore = installFakeRuntime({
      profile: { identity: { display_name: "T", neurotypes: ["adhd"] } },
      exists: true,
    });
    const r = await nativeHostSetProfile(
      { identity: { display_name: "Alex", neurotypes: [] } },
      { confirmOverwrite: true },
    );
    expect(r.ok).toBe(true);
  });
});
