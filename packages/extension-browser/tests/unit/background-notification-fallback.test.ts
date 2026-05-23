/**
 * P1.4 — context-menu translation falls back to chrome.notifications
 * when chrome.tabs.sendMessage rejects (i.e. the user right-clicked on a
 * URL outside the 9 declared host_permissions, so no content-script
 * island is mounted to receive the result).
 *
 * Pre-this-fix the translation succeeded silently into IndexedDB and the
 * user saw nothing — actionless behaviour from their perspective.
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
  appendHistory: vi.fn(),
  truncatePreview: vi.fn((s: string) => s),
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
    historyEnabled: false,
    displayName: "you",
  };
}

function okResponse(): TranslationResponse {
  return {
    ok: true,
    tool: "translate_incoming",
    data: { explicit_ask: "hi" },
    error: null,
    mockMode: false,
    provenance: { mode: "local", provider: "ollama", model: "llama3.2:3b" },
    timestamp: "2026-05-23T10:00:00.000Z",
  };
}

describe("context-menu notification fallback (P1.4)", () => {
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
      },
      contextMenus: {
        create: vi.fn((_def: unknown, cb?: () => void) => cb?.()),
        onClicked: contextClickTarget,
      },
      tabs: { sendMessage: tabsSendMessage },
      notifications: { create: notificationsCreate },
    };

    vi.mocked(profileModule.loadProfile).mockResolvedValue(baseProfile());
    vi.mocked(translationClient.translate).mockResolvedValue(okResponse());

    registerHandlers();
  });

  it("invokes chrome.notifications.create when tabs.sendMessage rejects", async () => {
    tabsSendMessage.mockRejectedValueOnce(
      new Error(
        "Could not establish connection. Receiving end does not exist.",
      ),
    );
    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-translate-selection",
        selectionText: "the selected text",
      },
      { id: 42, url: "https://example.com/profile" },
    );
    // Wait for the async dispatcher chain (runTranslate -> sendMessage
    // rejection -> notifyContextResultFallback).
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsSendMessage).toHaveBeenCalledTimes(1);
    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    const call = notificationsCreate.mock.calls[0]![0] as {
      type: string;
      title: string;
      message: string;
      iconUrl: string;
    };
    expect(call.type).toBe("basic");
    expect(call.title).toMatch(/NeuroDock/);
    expect(call.message).toMatch(/example\.com/);
  });

  it("does NOT show a notification when tabs.sendMessage resolves", async () => {
    tabsSendMessage.mockResolvedValueOnce(undefined);
    contextClickTarget._invoke(
      {
        menuItemId: "neurodock-translate-selection",
        selectionText: "ok",
      },
      { id: 99, url: "https://mail.google.com/mail/u/0/" },
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsSendMessage).toHaveBeenCalledTimes(1);
    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it("surfaces a clear title when the translation fell back to mock", async () => {
    vi.mocked(translationClient.translate).mockResolvedValueOnce({
      ...okResponse(),
      mockMode: true,
      provenance: {
        mode: "local",
        provider: "ollama",
        model: "llama3.2:3b",
      },
    });
    tabsSendMessage.mockRejectedValueOnce(new Error("no receiver"));
    contextClickTarget._invoke(
      { menuItemId: "neurodock-translate-selection", selectionText: "x" },
      { id: 7, url: "https://random.site/" },
    );
    await new Promise((r) => setTimeout(r, 10));

    const call = notificationsCreate.mock.calls[0]![0] as { title: string };
    expect(call.title).toMatch(/mock/i);
  });
});
