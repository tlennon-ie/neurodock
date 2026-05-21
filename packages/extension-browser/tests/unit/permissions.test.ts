/**
 * Tests for the host-permission helper (v0.0.4).
 *
 * Mocks the chrome.permissions surface and asserts:
 *   - localhost / 127.0.0.1 short-circuit (no prompt fires).
 *   - Non-localhost grant returns granted=true with origin.
 *   - Non-localhost denial returns granted=false with reason='user-denied'.
 *   - Invalid URLs return reason='invalid-url'.
 *   - hasHostPermission consults contains() without prompting.
 *   - listGrantedNonDefaultOrigins filters the defaults out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requestHostPermission,
  revokeHostPermission,
  hasHostPermission,
  listGrantedNonDefaultOrigins,
} from "../../src/lib/permissions.js";

interface RequestArg {
  readonly origins?: string[];
}

function stubChromePermissions(stubs: {
  request?: (arg: RequestArg) => boolean;
  contains?: (arg: RequestArg) => boolean;
  remove?: (arg: RequestArg) => boolean;
  getAll?: () => { origins: string[] };
}): {
  requestSpy: ReturnType<typeof vi.fn>;
  containsSpy: ReturnType<typeof vi.fn>;
  removeSpy: ReturnType<typeof vi.fn>;
  getAllSpy: ReturnType<typeof vi.fn>;
} {
  const requestSpy = vi.fn((arg: RequestArg, cb: (g: boolean) => void) => {
    cb(stubs.request?.(arg) ?? false);
  });
  const containsSpy = vi.fn((arg: RequestArg, cb: (g: boolean) => void) => {
    cb(stubs.contains?.(arg) ?? false);
  });
  const removeSpy = vi.fn((arg: RequestArg, cb: (g: boolean) => void) => {
    cb(stubs.remove?.(arg) ?? true);
  });
  const getAllSpy = vi.fn((cb: (a: { origins: string[] }) => void) => {
    cb(stubs.getAll?.() ?? { origins: [] });
  });
  (globalThis as { chrome: { permissions: unknown } }).chrome.permissions = {
    request: requestSpy,
    contains: containsSpy,
    remove: removeSpy,
    getAll: getAllSpy,
  };
  return { requestSpy, containsSpy, removeSpy, getAllSpy };
}

describe("requestHostPermission", () => {
  beforeEach(() => {
    stubChromePermissions({});
  });

  it("short-circuits for localhost without prompting", async () => {
    const { requestSpy } = stubChromePermissions({});
    const res = await requestHostPermission("http://localhost:1234/v1");
    expect(res.granted).toBe(true);
    expect(res.origin).toBe("http://localhost:1234");
    expect(res.reason).toBeUndefined();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("short-circuits for 127.0.0.1 without prompting", async () => {
    const { requestSpy } = stubChromePermissions({});
    const res = await requestHostPermission("http://127.0.0.1:11434");
    expect(res.granted).toBe(true);
    expect(res.origin).toBe("http://127.0.0.1:11434");
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("returns granted=true when chrome.permissions.request resolves true", async () => {
    const { requestSpy } = stubChromePermissions({
      contains: () => false,
      request: () => true,
    });
    const res = await requestHostPermission("http://169.254.83.107:1234/v1");
    expect(res.granted).toBe(true);
    expect(res.origin).toBe("http://169.254.83.107:1234");
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0]?.[0]).toEqual({
      origins: ["http://169.254.83.107:1234/*"],
    });
  });

  it("returns granted=false with reason='user-denied' when the user rejects", async () => {
    stubChromePermissions({
      contains: () => false,
      request: () => false,
    });
    const res = await requestHostPermission("http://192.168.1.50:1234/v1");
    expect(res.granted).toBe(false);
    expect(res.origin).toBe("http://192.168.1.50:1234");
    expect(res.reason).toBe("user-denied");
  });

  it("returns reason='invalid-url' for unparseable URLs", async () => {
    const res = await requestHostPermission("not a url");
    expect(res.granted).toBe(false);
    expect(res.reason).toBe("invalid-url");
  });

  it("skips the prompt when the host is already granted", async () => {
    const { requestSpy, containsSpy } = stubChromePermissions({
      contains: () => true,
      request: () => false,
    });
    const res = await requestHostPermission("http://10.0.0.5:1234/v1");
    expect(res.granted).toBe(true);
    expect(containsSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).not.toHaveBeenCalled();
  });
});

describe("hasHostPermission", () => {
  it("returns true for localhost without consulting chrome.permissions", async () => {
    const { containsSpy } = stubChromePermissions({});
    const ok = await hasHostPermission("http://localhost:1234");
    expect(ok).toBe(true);
    expect(containsSpy).not.toHaveBeenCalled();
  });

  it("returns the result of chrome.permissions.contains for non-localhost", async () => {
    stubChromePermissions({ contains: () => true });
    const ok = await hasHostPermission("http://169.254.1.2:11434");
    expect(ok).toBe(true);
  });

  it("returns false when the URL is unparseable", async () => {
    const ok = await hasHostPermission("garbage");
    expect(ok).toBe(false);
  });
});

describe("revokeHostPermission", () => {
  it("calls chrome.permissions.remove with the trailing /*", async () => {
    const { removeSpy } = stubChromePermissions({ remove: () => true });
    const res = await revokeHostPermission("http://10.0.0.5:1234");
    expect(res.granted).toBe(false);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls[0]?.[0]).toEqual({
      origins: ["http://10.0.0.5:1234/*"],
    });
  });

  it("short-circuits for localhost (cannot be revoked)", async () => {
    const { removeSpy } = stubChromePermissions({});
    const res = await revokeHostPermission("http://localhost:1234");
    expect(res.granted).toBe(true);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});

describe("listGrantedNonDefaultOrigins", () => {
  it("filters out localhost, 127.0.0.1, cloud hosts, and per-site origins", async () => {
    stubChromePermissions({
      getAll: () => ({
        origins: [
          "http://localhost/*",
          "http://127.0.0.1/*",
          "https://api.anthropic.com/*",
          "https://api.openai.com/*",
          "https://openrouter.ai/*",
          "https://mail.google.com/*",
          "http://169.254.83.107:1234/*",
          "http://10.0.0.5:11434/*",
        ],
      }),
    });
    const out = await listGrantedNonDefaultOrigins();
    expect(out).toEqual([
      "http://169.254.83.107:1234",
      "http://10.0.0.5:11434",
    ]);
  });

  it("returns an empty array when no non-default origins are granted", async () => {
    stubChromePermissions({
      getAll: () => ({
        origins: ["http://localhost/*", "https://mail.google.com/*"],
      }),
    });
    const out = await listGrantedNonDefaultOrigins();
    expect(out).toEqual([]);
  });
});
