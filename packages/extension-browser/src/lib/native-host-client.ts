/**
 * Browser-side client for `@neurodock/native-host`.
 *
 * Opens a Chrome Native Messaging port to `com.neurodock.profile` and
 * speaks the length-prefixed JSON protocol documented in
 * `packages/native-host/src/protocol.ts`.
 *
 * The client is intentionally tolerant: any failure to connect — host
 * not installed, manifest missing, browser doesn't support native
 * messaging, request times out — is reported as `{ available: false }`
 * rather than thrown. The caller (profile.ts) then falls back to the
 * extension-local store. The native host is OPTIONAL.
 */

export type NativeHostStatus = "active" | "absent" | "error";

export interface NativeHostHello {
  readonly status: NativeHostStatus;
  readonly version?: string;
  readonly path?: string;
  readonly detail?: string;
}

export interface NativeHostGetResult {
  readonly path: string;
  readonly exists: boolean;
  readonly profile: unknown;
}

export interface NativeHostSetResult {
  readonly path: string;
  readonly created: boolean;
  readonly bytesWritten: number;
}

export interface NativeHostResponse<T = unknown> {
  readonly id?: string;
  readonly ok: boolean;
  readonly op: string;
  readonly data: T | null;
  readonly error: string | null;
  readonly version: string;
}

interface NativePort {
  postMessage(value: unknown): void;
  disconnect(): void;
  onMessage: { addListener(fn: (msg: unknown) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

interface NativeRuntime {
  connectNative(name: string): NativePort;
  readonly lastError?: { message?: string } | undefined;
}

const HOST_NAME = "com.neurodock.profile";
const DEFAULT_TIMEOUT_MS = 1500;

function getRuntime(): NativeRuntime | null {
  const g = globalThis as unknown as { chrome?: { runtime?: NativeRuntime } };
  if (g.chrome?.runtime?.connectNative) {
    return g.chrome.runtime;
  }
  return null;
}

interface PendingRequest {
  resolve: (value: NativeHostResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class NativeHostSession {
  private readonly port: NativePort;
  private readonly pending = new Map<string, PendingRequest>();
  private disconnected = false;
  private disconnectReason: string | null = null;
  private seq = 0;

  constructor(port: NativePort) {
    this.port = port;
    port.onMessage.addListener((msg) => this.onMessage(msg));
    port.onDisconnect.addListener(() => this.onDisconnect());
  }

  private onMessage(msg: unknown): void {
    if (!isResponse(msg)) return;
    const id = msg.id;
    if (id === undefined) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(msg);
  }

  private onDisconnect(): void {
    this.disconnected = true;
    const rt = getRuntime();
    this.disconnectReason = rt?.lastError?.message ?? "port disconnected";
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`native host: ${this.disconnectReason}`));
    }
    this.pending.clear();
  }

  request(
    op: "ping" | "get" | "set",
    payload?: unknown,
    confirmOverwrite?: boolean,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<NativeHostResponse> {
    if (this.disconnected) {
      return Promise.reject(new Error(`native host: ${this.disconnectReason ?? "disconnected"}`));
    }
    const id = `nd-${++this.seq}`;
    return new Promise<NativeHostResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`native host: request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        const message: Record<string, unknown> = { id, op };
        if (payload !== undefined) message["payload"] = payload;
        if (confirmOverwrite === true) message["confirmOverwrite"] = true;
        this.port.postMessage(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  close(): void {
    try {
      this.port.disconnect();
    } catch {
      // ignore
    }
  }
}

function isResponse(value: unknown): value is NativeHostResponse {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["ok"] === "boolean" && typeof v["op"] === "string";
}

function openSession(): NativeHostSession | null {
  const rt = getRuntime();
  if (!rt) return null;
  try {
    const port = rt.connectNative(HOST_NAME);
    return new NativeHostSession(port);
  } catch {
    return null;
  }
}

/**
 * Probe the native host. Returns active/absent/error and never throws.
 */
export async function probeNativeHost(): Promise<NativeHostHello> {
  const session = openSession();
  if (!session) {
    return { status: "absent", detail: "chrome.runtime.connectNative unavailable" };
  }
  try {
    const r = await session.request("ping", undefined, undefined, 1000);
    session.close();
    if (!r.ok) {
      return { status: "error", detail: r.error ?? "ping failed" };
    }
    const data = r.data as { version?: string } | null;
    return { status: "active", version: data?.version ?? r.version };
  } catch (err) {
    session.close();
    return { status: "absent", detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function nativeHostGetProfile(): Promise<NativeHostGetResult | null> {
  const session = openSession();
  if (!session) return null;
  try {
    const r = await session.request("get");
    session.close();
    if (!r.ok || r.data === null) return null;
    return r.data as NativeHostGetResult;
  } catch {
    session.close();
    return null;
  }
}

export interface NativeHostSetOptions {
  readonly confirmOverwrite?: boolean;
}

export interface NativeHostSetOutcome {
  readonly ok: boolean;
  readonly confirmRequired: boolean;
  readonly error: string | null;
  readonly result: NativeHostSetResult | null;
}

export async function nativeHostSetProfile(
  profile: Record<string, unknown>,
  opts: NativeHostSetOptions = {},
): Promise<NativeHostSetOutcome> {
  const session = openSession();
  if (!session) {
    return {
      ok: false,
      confirmRequired: false,
      error: "native host not available",
      result: null,
    };
  }
  try {
    const r = await session.request("set", profile, opts.confirmOverwrite ?? false);
    session.close();
    if (r.ok) {
      return {
        ok: true,
        confirmRequired: false,
        error: null,
        result: r.data as NativeHostSetResult,
      };
    }
    const error = r.error ?? "set failed";
    return {
      ok: false,
      confirmRequired: error.includes("CONFIRM_REQUIRED"),
      error,
      result: null,
    };
  } catch (err) {
    session.close();
    return {
      ok: false,
      confirmRequired: false,
      error: err instanceof Error ? err.message : String(err),
      result: null,
    };
  }
}
