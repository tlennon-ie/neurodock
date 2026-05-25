/**
 * Protocol tests for the 0.0.31 in-page translation indicator.
 *
 * Asserts that background.ts:
 *
 *   1. Sends a `translation:starting` message to the originating tab
 *      BEFORE invoking translate(), with a fresh requestId + the
 *      indicator target derived from the right-clicked anchor.
 *
 *   2. Sends a `translation:complete` message AFTER translate() settles,
 *      with the SAME requestId, `ok: true` on a clean success, and
 *      `ok: false` when the response is an error or a mock fallback.
 *
 * The right-click + context-result path (`dispatchContextResult` →
 * `tryDeliver`) is mocked out for the image case by intercepting
 * `chrome.tabs.sendMessage` and inspecting the sequence of message
 * `type` fields.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("wxt/utils/define-background", () => ({
  defineBackground: (fn: () => void) => fn,
}));

vi.mock("../../src/lib/translation-client.js", () => ({
  translate: vi.fn(),
  detectChannelFromUrl: vi.fn(() => "generic" as const),
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
import { registerHandlers } from "../../entrypoints/background.js";
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
    localProvider: "ollama",
    localEndpoint: "http://localhost:11434",
    localModel: "llama3.2:3b",
    localApiKey: null,
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    cloudApiKeys: {},
    historyEnabled: false,
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
    tool: "describe_image",
    data: { description: "a cat" },
    error: null,
    mockMode: false,
    provenance: { mode: "local", provider: "ollama", model: "llama3.2:3b" },
    timestamp: "2026-05-26T10:00:00.000Z",
  };
}

function errorResponse(): TranslationResponse {
  return {
    ok: false,
    tool: "describe_image",
    data: null,
    error: "VISION_MODEL_REQUIRED",
    mockMode: false,
    provenance: { mode: "local", provider: "ollama", model: "llama3.2:3b" },
    timestamp: "2026-05-26T10:00:01.000Z",
  };
}

describe("translation indicator protocol — context menu → SW → tab", () => {
  let contextClickTarget: Capturable;
  let installedTarget: Capturable;
  let messageTarget: Capturable;
  let tabsSendMessage: ReturnType<typeof vi.fn>;
  let permissionsRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    contextClickTarget = makeCapturable();
    installedTarget = makeCapturable();
    messageTarget = makeCapturable();
    tabsSendMessage = vi.fn().mockResolvedValue({ ack: true });
    permissionsRequest = vi.fn(
      (_perm: { origins?: string[] }, cb: (granted: boolean) => void): void => {
        cb(true);
      },
    );

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
      permissions: { request: permissionsRequest },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
      notifications: { create: vi.fn() },
    };

    // crypto.randomUUID is provided by Node and used by background.ts to
    // generate request ids. We assert START and COMPLETE share an id
    // rather than pinning the id value itself.

    vi.mocked(profileModule.loadProfile).mockResolvedValue(baseProfile());

    registerHandlers();
  });

  it("sends translation:starting BEFORE translate() resolves, then translation:complete with matching requestId on success (image right-click)", async () => {
    // Defer the translate() resolution so we can observe the
    // starting-message timing relative to the translate-complete.
    let resolveTranslate: (r: TranslationResponse) => void = () => undefined;
    const pending = new Promise<TranslationResponse>((resolve) => {
      resolveTranslate = resolve;
    });
    vi.mocked(translationClient.translate).mockReturnValue(pending);

    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-describe-image",
        srcUrl: "https://example.test/cat.png",
      },
      { id: 7, url: "https://example.test/page" },
    );

    // Let the synchronous permission grant + the SW dispatcher start.
    await new Promise((r) => setTimeout(r, 10));

    // translation:starting must be dispatched BEFORE translate() has
    // settled — and crucially before any translation:complete or
    // neurodock:context-result message. (image:snapshot fires first for
    // image translations; we ignore it here as it's the canvas-snapshot
    // pre-flight, not part of the indicator protocol.)
    const earlyMessages = tabsSendMessage.mock.calls.map(
      (call) => (call[1] as { type?: string }).type,
    );
    expect(earlyMessages).toContain("translation:starting");
    expect(earlyMessages).not.toContain("translation:complete");
    expect(earlyMessages).not.toContain("neurodock:context-result");

    // Inspect the starting payload.
    const startingCall = tabsSendMessage.mock.calls.find(
      (call) => (call[1] as { type?: string }).type === "translation:starting",
    );
    expect(startingCall).toBeDefined();
    const startingMsg = startingCall![1] as {
      type: string;
      requestId: string;
      target: { kind: string; imageUrl?: string };
    };
    expect(typeof startingMsg.requestId).toBe("string");
    expect(startingMsg.requestId.length).toBeGreaterThan(0);
    expect(startingMsg.target.kind).toBe("image");
    expect(startingMsg.target.imageUrl).toBe("https://example.test/cat.png");

    // Now let translate() settle.
    resolveTranslate(okResponse());
    await new Promise((r) => setTimeout(r, 30));

    // Find the complete message — must share the requestId and report ok.
    const completeCall = tabsSendMessage.mock.calls.find(
      (call) => (call[1] as { type?: string }).type === "translation:complete",
    );
    expect(completeCall).toBeDefined();
    const completeMsg = completeCall![1] as {
      requestId: string;
      ok: boolean;
    };
    expect(completeMsg.requestId).toBe(startingMsg.requestId);
    expect(completeMsg.ok).toBe(true);
  });

  it("emits translation:complete with ok:false when the response is an error", async () => {
    vi.mocked(translationClient.translate).mockResolvedValue(errorResponse());

    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-describe-image",
        srcUrl: "https://example.test/img2.png",
      },
      { id: 8, url: "https://example.test/page" },
    );

    await new Promise((r) => setTimeout(r, 30));

    const completeCall = tabsSendMessage.mock.calls.find(
      (call) => (call[1] as { type?: string }).type === "translation:complete",
    );
    expect(completeCall).toBeDefined();
    const completeMsg = completeCall![1] as {
      requestId: string;
      ok: boolean;
      errorMessage?: string;
    };
    expect(completeMsg.ok).toBe(false);
    expect(completeMsg.errorMessage).toContain("VISION_MODEL_REQUIRED");
  });

  it("sends translation:starting with cursor target on a text-selection translate (no image)", async () => {
    vi.mocked(translationClient.translate).mockResolvedValue({
      ...okResponse(),
      tool: "translate_incoming",
      data: { explicit_ask: "sync up" },
    });

    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-translate-selection",
        selectionText: "we should sync",
      },
      { id: 9, url: "https://example.test/page" },
    );

    await new Promise((r) => setTimeout(r, 30));

    const startingCall = tabsSendMessage.mock.calls.find(
      (call) => (call[1] as { type?: string }).type === "translation:starting",
    );
    expect(startingCall).toBeDefined();
    const startingMsg = startingCall![1] as {
      requestId: string;
      target: { kind: string };
    };
    expect(startingMsg.target.kind).toBe("cursor");
    expect(typeof startingMsg.requestId).toBe("string");
    expect(startingMsg.requestId.length).toBeGreaterThan(0);

    // SW does not have cursor coords (Chrome doesn't expose them); the
    // content script fills them in from its locally-tracked
    // contextmenu position.
    const completeCall = tabsSendMessage.mock.calls.find(
      (call) => (call[1] as { type?: string }).type === "translation:complete",
    );
    expect(completeCall).toBeDefined();
    expect((completeCall![1] as { requestId: string }).requestId).toBe(
      startingMsg.requestId,
    );
  });
});
