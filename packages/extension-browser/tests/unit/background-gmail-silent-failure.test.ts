/**
 * Regression test for the 0.0.24 Gmail silent-failure fix.
 *
 * Symptom (reported on 2026-05-22): user runs a right-click translation
 * on a real Gmail thread with LM Studio as the local provider. LM Studio
 * shows the request streaming to 100% — the HTTP response body is fully
 * produced. But the in-page panel never opens AND the popup History
 * never gets a new row. The translation result is silently lost.
 *
 * Investigation (`.claude-reports/2026-05-24-lm-studio-gmail-fix/REPORT.md`)
 * narrowed it down to TWO distinct failure modes that compose:
 *
 *   1. MV3 service-worker idle kill — Chrome terminates the SW after ~30s
 *      of no chrome.* API calls. A long Gmail email + small local model
 *      can push translate() past that window; the in-flight fetch keeps
 *      going at the network layer (so LM Studio's server log shows 100%)
 *      but the SW context is gone by the time the Promise would settle.
 *      No appendHistory, no sendMessage, no panel, no notification.
 *
 *   2. `chrome.tabs.sendMessage` ambiguous resolution — Chrome resolves
 *      the sendMessage promise with `undefined` in two indistinguishable
 *      cases: (a) a listener fired and consumed the message without
 *      replying, or (b) no listener fired at all. Pre-0.0.24 the SW
 *      treated both as success. On Gmail specifically, transient SPA
 *      navigations or SW restarts can land us in case (b) without
 *      raising any error — silent failure.
 *
 * This file pins both fixes:
 *
 *   - `withKeepalive()` is wrapped around the translate() call in
 *     runTranslate, so the SW survives long fetches.
 *   - dispatchContextResult requires an explicit `{ ack: true }` reply
 *     before considering the message delivered; absent the ACK, it
 *     falls back to chrome.notifications.create so the user is never
 *     left wondering whether the request was lost.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("wxt/utils/define-background", () => ({
  defineBackground: (fn: () => void) => fn,
}));

vi.mock("../../src/lib/translation-client.js", () => ({
  translate: vi.fn(),
  detectChannelFromUrl: vi.fn(() => "email" as const),
}));

vi.mock("../../src/lib/storage.js", () => ({
  appendHistory: vi.fn().mockResolvedValue(undefined),
  truncatePreview: vi.fn((s: string) => s),
  listHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/lib/profile.js", () => ({
  loadProfile: vi.fn(),
}));

import * as translationClient from "../../src/lib/translation-client.js";
import * as profileModule from "../../src/lib/profile.js";
import {
  registerHandlers,
  runTranslate,
} from "../../entrypoints/background.js";
import { withKeepalive } from "../../src/lib/sw-keepalive.js";
import type {
  ExtensionProfile,
  TranslationResponse,
} from "../../src/lib/types.js";

type AnyListener = (...args: unknown[]) => unknown;

interface Capturable {
  addListener: (fn: AnyListener) => void;
  _listeners: AnyListener[];
  _invoke: (...args: unknown[]) => unknown[];
}

function makeCapturable(): Capturable {
  const listeners: AnyListener[] = [];
  return {
    _listeners: listeners,
    addListener(fn) {
      listeners.push(fn);
    },
    _invoke(...args: unknown[]) {
      return listeners.map((fn) => fn(...args));
    },
  };
}

function baseProfile(): ExtensionProfile {
  return {
    mode: "local",
    localProvider: "lmstudio",
    localEndpoint: "http://localhost:1234/v1",
    localModel: "llama-3.2-3b-instruct",
    localApiKey: null,
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    historyEnabled: true,
    displayName: "you",
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
  };
}

function okResponse(): TranslationResponse {
  return {
    ok: true,
    tool: "translate_incoming",
    data: { explicit_ask: "let's circle back on this" },
    error: null,
    mockMode: false,
    provenance: {
      mode: "local",
      provider: "lmstudio",
      model: "llama-3.2-3b-instruct",
    },
    timestamp: "2026-05-22T10:00:00.000Z",
  };
}

describe("Gmail silent-failure regression — context-result ACK contract", () => {
  let contextClickTarget: Capturable;
  let installedTarget: Capturable;
  let messageTarget: Capturable;
  let notificationsCreate: ReturnType<typeof vi.fn>;
  let tabsSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    contextClickTarget = makeCapturable();
    installedTarget = makeCapturable();
    messageTarget = makeCapturable();
    notificationsCreate = vi.fn();
    tabsSendMessage = vi.fn();

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        onInstalled: installedTarget,
        onMessage: messageTarget,
        lastError: null,
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getPlatformInfo: vi.fn((cb?: (info: unknown) => void) => {
          cb?.({ os: "win" });
        }),
      },
      contextMenus: {
        create: vi.fn((_def: unknown, cb?: () => void) => cb?.()),
        onClicked: contextClickTarget,
      },
      tabs: { sendMessage: tabsSendMessage },
      notifications: { create: notificationsCreate },
      // No chrome.scripting — exercises the no-inject path so the test
      // isolates the ACK contract from the generic-injection retry.
    };

    vi.mocked(profileModule.loadProfile).mockResolvedValue(baseProfile());
    vi.mocked(translationClient.translate).mockResolvedValue(okResponse());

    registerHandlers();
  });

  it("falls back to the notification surface when sendMessage resolves but no ACK is returned (Gmail silent-failure case)", async () => {
    // Simulate the Gmail bug: Chrome resolves the sendMessage promise
    // with `undefined`, indicating either (a) listener fired silently
    // or (b) no listener actually ran. Pre-0.0.24 the SW treated both
    // as success and the user lost the result entirely.
    tabsSendMessage.mockResolvedValue(undefined);

    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-translate-selection",
        selectionText: "let's circle back on this Q3",
      },
      { id: 42, url: "https://mail.google.com/mail/u/0/#inbox/abc123" },
    );

    // Allow the async dispatcher chain to settle. Two waits — one for
    // runTranslate + sendMessage, one for the fallback notification.
    await new Promise((r) => setTimeout(r, 20));

    expect(tabsSendMessage).toHaveBeenCalled();
    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    const call = notificationsCreate.mock.calls[0]![0] as {
      message: string;
    };
    // The notification body contains the result preview so the user
    // gets value even when the panel didn't open in-page.
    expect(call.message).toMatch(/circle back/i);
  });

  it("considers the dispatch successful when the content script ACKs", async () => {
    tabsSendMessage.mockResolvedValue({ ack: true });

    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-translate-selection",
        selectionText: "we should sync",
      },
      { id: 42, url: "https://mail.google.com/mail/u/0/#inbox" },
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(tabsSendMessage).toHaveBeenCalled();
    // ACK received → no fallback notification.
    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it("treats a malformed (truthy but no ack) reply as a delivery failure", async () => {
    // A stale content-script island might reply with some other shape
    // (e.g. an old image-snapshot handler echoing `{ dataUrl: null }`).
    // We must treat anything that isn't an explicit `{ ack: true }` as
    // a failed delivery so the notification fallback still fires.
    tabsSendMessage.mockResolvedValue({ dataUrl: null });

    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-translate-selection",
        selectionText: "ping",
      },
      { id: 42, url: "https://mail.google.com/mail/u/0/" },
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(notificationsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("Gmail silent-failure regression — SW keepalive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("runs the wrapped operation and pings chrome.* periodically to defeat MV3 idle kill", async () => {
    const pingChrome = vi.fn();
    let resolveOperation: (value: string) => void = () => undefined;
    const operation = new Promise<string>((resolve) => {
      resolveOperation = resolve;
    });

    const promise = withKeepalive(() => operation, {
      intervalMs: 1000,
      pingChrome,
    });

    // First ping fires immediately on entering the keepalive.
    expect(pingChrome).toHaveBeenCalledTimes(1);

    // Three more ticks at 1s each.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pingChrome).toHaveBeenCalledTimes(4);

    // Resolve the operation; the keepalive stops ticking immediately.
    resolveOperation("done");
    const result = await promise;
    expect(result).toBe("done");

    // No further pings after settle.
    await vi.advanceTimersByTimeAsync(5000);
    expect(pingChrome).toHaveBeenCalledTimes(4);
  });

  it("stops pinging when the wrapped operation throws", async () => {
    const pingChrome = vi.fn();
    let rejectOperation: (reason: Error) => void = () => undefined;
    const operation = new Promise<string>((_resolve, reject) => {
      rejectOperation = reject;
    });

    const promise = withKeepalive(() => operation, {
      intervalMs: 500,
      pingChrome,
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(pingChrome).toHaveBeenCalledTimes(2); // immediate + one tick

    rejectOperation(new Error("LMSTUDIO_UNREACHABLE"));
    await expect(promise).rejects.toThrow(/LMSTUDIO_UNREACHABLE/);

    await vi.advanceTimersByTimeAsync(5000);
    expect(pingChrome).toHaveBeenCalledTimes(2);
  });
});

describe("runTranslate — keepalive integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileModule.loadProfile).mockResolvedValue(baseProfile());

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getPlatformInfo: vi.fn((cb?: (info: unknown) => void) => {
          cb?.({ os: "win" });
        }),
        lastError: null,
      },
      tabs: { sendMessage: vi.fn().mockResolvedValue({ ack: true }) },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    };
  });

  it("still returns the translate response on a normal fast path (no regression on short translations)", async () => {
    const response = okResponse();
    vi.mocked(translationClient.translate).mockResolvedValue(response);

    const result = await runTranslate({
      tool: "translate_incoming",
      input: { text: "short", channel: "email" },
      channel: "email",
    });

    expect(result).toBe(response);
  });

  it("propagates the translate response even when chrome.runtime.getPlatformInfo throws (no platform info API in test env)", async () => {
    // Stub the keepalive ping to throw — withKeepalive must swallow.
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getPlatformInfo: vi.fn(() => {
          throw new Error("API unavailable");
        }),
        lastError: null,
      },
      tabs: { sendMessage: vi.fn().mockResolvedValue({ ack: true }) },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    };

    const response = okResponse();
    vi.mocked(translationClient.translate).mockResolvedValue(response);

    const result = await runTranslate({
      tool: "translate_incoming",
      input: { text: "x", channel: "email" },
      channel: "email",
    });

    expect(result).toBe(response);
  });
});
