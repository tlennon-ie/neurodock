/**
 * Unit tests for the three units in entrypoints/background.ts:
 *
 *   1. runTranslate — history side-effect (appendHistory + history:updated)
 *   2. contextMenus.onClicked dispatcher — routes selection to runTranslate,
 *      sends result to the content-script tab, guards empty selection
 *   3. runtime.onMessage translate path — envelope success + error paths
 *   4. runtime.onMessage profile:get path — regression for 0.0.8 fix
 *
 * Production behaviour is unchanged: the only structural edit to
 * background.ts was exporting `runTranslate` and `registerHandlers()`,
 * with the default export still calling `defineBackground(() => registerHandlers())`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── module mocks ───────────────────────────────────────────────────────────
// Must be declared before any import that transitively loads the mocked module.

vi.mock("wxt/utils/define-background", () => ({
  defineBackground: (fn: () => void) => fn,
}));

vi.mock("../../src/lib/translation-client.js", () => ({
  translate: vi.fn(),
  detectChannelFromUrl: vi.fn((url: string) => {
    if (url.includes("mail.google.com")) return "email";
    if (url.includes("app.slack.com")) return "slack";
    return "generic";
  }),
}));

vi.mock("../../src/lib/storage.js", () => ({
  appendHistory: vi.fn(),
  truncatePreview: vi.fn((s: string) => s),
}));

vi.mock("../../src/lib/profile.js", () => ({
  loadProfile: vi.fn(),
}));

// ── imports after mocks ────────────────────────────────────────────────────
import * as translationClient from "../../src/lib/translation-client.js";
import * as storage from "../../src/lib/storage.js";
import * as profileModule from "../../src/lib/profile.js";
import {
  runTranslate,
  registerHandlers,
} from "../../entrypoints/background.js";
import type {
  ExtensionProfile,
  TranslationRequest,
  TranslationResponse,
} from "../../src/lib/types.js";

// ── helpers ────────────────────────────────────────────────────────────────

function baseProfile(
  overrides: Partial<ExtensionProfile> = {},
): ExtensionProfile {
  return {
    mode: "local",
    localProvider: "lmstudio",
    localEndpoint: "http://localhost:1234/v1",
    localModel: "llama-3.2-3b-instruct",
    localApiKey: null,
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    cloudApiKeys: {},
    historyEnabled: true,
    displayName: "you",
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
    ...overrides,
  };
}

function okResponse(
  overrides: Partial<TranslationResponse> = {},
): TranslationResponse {
  return {
    ok: true,
    tool: "translate_incoming",
    data: { explicit_ask: "hello" },
    error: null,
    mockMode: false,
    provenance: {
      mode: "local",
      provider: "lmstudio",
      model: "llama-3.2-3b-instruct",
    },
    timestamp: "2026-05-23T10:00:00.000Z",
    ...overrides,
  };
}

// ── type helpers for chrome shim augmentation ─────────────────────────────

type ContextMenuClickInfo = chrome.contextMenus.OnClickData;
type AnyListener = (...args: unknown[]) => unknown;

interface CapturableEventTarget {
  addListener: (fn: AnyListener) => void;
  removeListener?: (fn: AnyListener) => void;
  _listeners: AnyListener[];
  _invoke: (...args: unknown[]) => unknown[];
}

function makeCapturable(): CapturableEventTarget {
  const listeners: AnyListener[] = [];
  return {
    _listeners: listeners,
    addListener(fn: AnyListener) {
      listeners.push(fn);
    },
    removeListener(fn: AnyListener) {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    },
    _invoke(...args: unknown[]) {
      return listeners.map((l) => l(...args));
    },
  };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("runTranslate — history side-effects", () => {
  let translateMock: ReturnType<typeof vi.fn>;
  let appendHistoryMock: ReturnType<typeof vi.fn>;
  let loadProfileMock: ReturnType<typeof vi.fn>;
  let sendMessageSpy: ReturnType<typeof vi.fn>;
  let originalSendMessage: typeof chrome.runtime.sendMessage;

  beforeEach(() => {
    translateMock = vi.mocked(translationClient.translate);
    appendHistoryMock = vi.mocked(storage.appendHistory);
    loadProfileMock = vi.mocked(profileModule.loadProfile);

    // Capture chrome.runtime.sendMessage calls
    originalSendMessage = chrome.runtime.sendMessage;
    sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    (chrome.runtime as { sendMessage: unknown }).sendMessage = sendMessageSpy;

    appendHistoryMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    (chrome.runtime as { sendMessage: unknown }).sendMessage =
      originalSendMessage;
    vi.clearAllMocks();
  });

  it("writes an appendHistory entry with tool, provider, mockMode when historyEnabled is true", async () => {
    const profile = baseProfile({ historyEnabled: true });
    loadProfileMock.mockResolvedValue(profile);
    const response = okResponse();
    translateMock.mockResolvedValue(response);

    const request: TranslationRequest = {
      tool: "translate_incoming",
      input: { text: "circle back", channel: "email" },
      channel: "email",
    };

    await runTranslate(request);

    expect(appendHistoryMock).toHaveBeenCalledOnce();
    const entry = appendHistoryMock.mock.calls[0]![0];
    expect(entry.tool).toBe("translate_incoming");
    expect(entry.provider).toBe("lmstudio");
    expect(entry.mockMode).toBe(false);
    expect(entry.channel).toBe("email");
  });

  it("broadcasts history:updated exactly once after a successful history write", async () => {
    const profile = baseProfile({ historyEnabled: true });
    loadProfileMock.mockResolvedValue(profile);
    translateMock.mockResolvedValue(okResponse());

    await runTranslate({
      tool: "translate_incoming",
      input: { text: "ping", channel: "email" },
      channel: "email",
    });

    const historyUpdatedCalls = sendMessageSpy.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "object" &&
        c[0] !== null &&
        (c[0] as { type?: string }).type === "history:updated",
    );
    expect(historyUpdatedCalls).toHaveLength(1);
  });

  it("does NOT call appendHistory when historyEnabled is false", async () => {
    const profile = baseProfile({ historyEnabled: false });
    loadProfileMock.mockResolvedValue(profile);
    translateMock.mockResolvedValue(okResponse());

    await runTranslate({
      tool: "translate_incoming",
      input: { text: "ping", channel: "email" },
      channel: "email",
    });

    expect(appendHistoryMock).not.toHaveBeenCalled();
  });

  it("does NOT broadcast history:updated when historyEnabled is false", async () => {
    const profile = baseProfile({ historyEnabled: false });
    loadProfileMock.mockResolvedValue(profile);
    translateMock.mockResolvedValue(okResponse());

    await runTranslate({
      tool: "translate_incoming",
      input: { text: "ping", channel: "email" },
      channel: "email",
    });

    const historyUpdatedCalls = sendMessageSpy.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "object" &&
        c[0] !== null &&
        (c[0] as { type?: string }).type === "history:updated",
    );
    expect(historyUpdatedCalls).toHaveLength(0);
  });

  it("returns the translate() response unchanged", async () => {
    const profile = baseProfile({ historyEnabled: false });
    loadProfileMock.mockResolvedValue(profile);
    const response = okResponse({ timestamp: "2026-05-23T12:00:00.000Z" });
    translateMock.mockResolvedValue(response);

    const result = await runTranslate({
      tool: "translate_incoming",
      input: { text: "text", channel: "generic" },
    });

    expect(result).toBe(response);
  });

  it("still returns response when appendHistory throws (history never blocks translation)", async () => {
    const profile = baseProfile({ historyEnabled: true });
    loadProfileMock.mockResolvedValue(profile);
    const response = okResponse();
    translateMock.mockResolvedValue(response);
    appendHistoryMock.mockRejectedValue(new Error("IndexedDB quota exceeded"));

    const result = await runTranslate({
      tool: "translate_incoming",
      input: { text: "text", channel: "email" },
      channel: "email",
    });

    expect(result).toBe(response);
  });
});

// ── contextMenus.onClicked dispatcher ──────────────────────────────────────

describe("contextMenus.onClicked dispatcher", () => {
  let contextMenusOnClicked: CapturableEventTarget;
  let originalOnClicked: typeof chrome.contextMenus.onClicked;
  let tabsSendMessageSpy: ReturnType<typeof vi.fn>;
  let originalTabsSendMessage: typeof chrome.tabs.sendMessage;
  let loadProfileMock: ReturnType<typeof vi.fn>;
  let translateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loadProfileMock = vi.mocked(profileModule.loadProfile);
    translateMock = vi.mocked(translationClient.translate);

    // Intercept contextMenus.onClicked
    contextMenusOnClicked = makeCapturable();
    originalOnClicked = chrome.contextMenus.onClicked;
    (chrome.contextMenus as { onClicked: unknown }).onClicked =
      contextMenusOnClicked;

    // Intercept tabs.sendMessage. 0.0.24: the content-script island now
    // ACKs the context-result message via sendResponse({ ack: true });
    // dispatchContextResult only treats the dispatch as successful when
    // it sees the ACK. Resolve the spy with the ACK shape by default so
    // existing tests still pass; the silent-fallback regression test
    // overrides this to resolve with `undefined` (simulating Chrome's
    // "promise resolves but no listener actually fired" behaviour).
    originalTabsSendMessage = chrome.tabs.sendMessage;
    tabsSendMessageSpy = vi.fn().mockResolvedValue({ ack: true });
    (chrome.tabs as { sendMessage: unknown }).sendMessage = tabsSendMessageSpy;

    // Load profile default
    loadProfileMock.mockResolvedValue(baseProfile({ historyEnabled: false }));

    // Register the listeners via registerHandlers so they attach to our shims
    registerHandlers();
  });

  afterEach(() => {
    (chrome.contextMenus as { onClicked: unknown }).onClicked =
      originalOnClicked;
    (chrome.tabs as { sendMessage: unknown }).sendMessage =
      originalTabsSendMessage;
    vi.clearAllMocks();
  });

  it("calls translate with the correct request shape when selection is present", async () => {
    const response = okResponse();
    translateMock.mockResolvedValue(response);

    const info: ContextMenuClickInfo = {
      menuItemId: "neurodock-translate-selection",
      selectionText: "let's circle back",
      editable: false,
      pageUrl: "https://mail.google.com/mail/u/0/#inbox",
    };
    const tab: chrome.tabs.Tab = {
      id: 42,
      url: "https://mail.google.com/mail/u/0/#inbox",
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      active: true,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
    };

    // Invoke and wait — the listener is async so we await its promise
    const promises = contextMenusOnClicked._invoke(
      info,
      tab,
    ) as Promise<void>[];
    await Promise.all(promises);

    expect(translateMock).toHaveBeenCalledOnce();
    const [calledRequest] = translateMock.mock.calls[0] as [TranslationRequest];
    expect(calledRequest.tool).toBe("translate_incoming");
    expect(calledRequest.input).toMatchObject({
      text: "let's circle back",
      channel: "email",
    });
    expect(calledRequest.channel).toBe("email");
  });

  it("sends the result back to the tab via tabs.sendMessage with the correct envelope", async () => {
    const response = okResponse();
    translateMock.mockResolvedValue(response);

    const info: ContextMenuClickInfo = {
      menuItemId: "neurodock-translate-selection",
      selectionText: "synergy",
      editable: false,
      pageUrl: "https://app.slack.com/client/T123",
    };
    const tab: chrome.tabs.Tab = {
      id: 7,
      url: "https://app.slack.com/client/T123",
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      active: true,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
    };

    const promises = contextMenusOnClicked._invoke(
      info,
      tab,
    ) as Promise<void>[];
    await Promise.all(promises);

    expect(tabsSendMessageSpy).toHaveBeenCalledOnce();
    const [tabId, msg] = tabsSendMessageSpy.mock.calls[0] as [number, unknown];
    expect(tabId).toBe(7);
    expect(msg).toMatchObject({
      type: "neurodock:context-result",
      response,
      sourceText: "synergy",
      channel: "slack",
    });
  });

  it("does not call translate when selectionText is empty", async () => {
    const info: ContextMenuClickInfo = {
      menuItemId: "neurodock-translate-selection",
      selectionText: "",
      editable: false,
      pageUrl: "https://mail.google.com/",
    };
    const tab: chrome.tabs.Tab = {
      id: 1,
      url: "https://mail.google.com/",
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      active: true,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
    };

    const promises = contextMenusOnClicked._invoke(
      info,
      tab,
    ) as Promise<void>[];
    await Promise.all(promises);

    expect(translateMock).not.toHaveBeenCalled();
    expect(tabsSendMessageSpy).not.toHaveBeenCalled();
  });

  it("does not call translate when menuItemId does not match", async () => {
    const info: ContextMenuClickInfo = {
      menuItemId: "some-other-menu",
      selectionText: "text",
      editable: false,
      pageUrl: "https://mail.google.com/",
    };
    const tab: chrome.tabs.Tab = {
      id: 1,
      url: "https://mail.google.com/",
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      active: true,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
    };

    const promises = contextMenusOnClicked._invoke(
      info,
      tab,
    ) as Promise<void>[];
    await Promise.all(promises);

    expect(translateMock).not.toHaveBeenCalled();
  });

  it("does not call translate when tab has no id", async () => {
    const info: ContextMenuClickInfo = {
      menuItemId: "neurodock-translate-selection",
      selectionText: "text",
      editable: false,
      pageUrl: "https://mail.google.com/",
    };
    // tab without id
    const tab = { url: "https://mail.google.com/" } as chrome.tabs.Tab;

    const promises = contextMenusOnClicked._invoke(
      info,
      tab,
    ) as Promise<void>[];
    await Promise.all(promises);

    expect(translateMock).not.toHaveBeenCalled();
  });
});

// ── runtime.onMessage handlers ─────────────────────────────────────────────

type MessageListener = (
  msg: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

describe("runtime.onMessage — translate path", () => {
  let runtimeOnMessage: CapturableEventTarget;
  let originalOnMessage: typeof chrome.runtime.onMessage;
  let translateMock: ReturnType<typeof vi.fn>;
  let loadProfileMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    translateMock = vi.mocked(translationClient.translate);
    loadProfileMock = vi.mocked(profileModule.loadProfile);
    loadProfileMock.mockResolvedValue(baseProfile({ historyEnabled: false }));

    runtimeOnMessage = makeCapturable();
    originalOnMessage = chrome.runtime.onMessage;
    (chrome.runtime as { onMessage: unknown }).onMessage = runtimeOnMessage;

    registerHandlers();
  });

  afterEach(() => {
    (chrome.runtime as { onMessage: unknown }).onMessage = originalOnMessage;
    vi.clearAllMocks();
  });

  it("calls sendResponse with success envelope when translation resolves", async () => {
    const response = okResponse();
    translateMock.mockResolvedValue(response);

    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    listener(
      {
        type: "translate",
        request: {
          tool: "translate_incoming",
          input: { text: "hi", channel: "email" },
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    // Give the async IIFE a tick to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(sendResponse).toHaveBeenCalledOnce();
    const envelope = sendResponse.mock.calls[0]![0];
    expect(envelope).toMatchObject({
      success: true,
      data: response,
      error: null,
    });
  });

  it("calls sendResponse with error envelope when translation rejects", async () => {
    translateMock.mockRejectedValue(new Error("LLM_OUTPUT_VALIDATION_FAILED"));

    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    listener(
      {
        type: "translate",
        request: { tool: "translate_incoming", input: { text: "hi" } },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(sendResponse).toHaveBeenCalledOnce();
    const envelope = sendResponse.mock.calls[0]![0];
    expect(envelope).toMatchObject({
      success: false,
      data: null,
      error: "LLM_OUTPUT_VALIDATION_FAILED",
    });
  });

  it("returns true (async response flag) for translate messages", () => {
    translateMock.mockResolvedValue(okResponse());

    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    const result = listener(
      {
        type: "translate",
        request: { tool: "translate_incoming", input: { text: "hi" } },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(true);
  });

  it("returns false for unrecognised message types", () => {
    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    const result = listener(
      { type: "unknown-type" },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(false);
  });

  it("returns false for null messages", () => {
    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    const result = listener(
      null,
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(false);
  });
});

describe("runtime.onMessage — profile:get path (0.0.8 regression)", () => {
  let runtimeOnMessage: CapturableEventTarget;
  let originalOnMessage: typeof chrome.runtime.onMessage;
  let loadProfileMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loadProfileMock = vi.mocked(profileModule.loadProfile);

    runtimeOnMessage = makeCapturable();
    originalOnMessage = chrome.runtime.onMessage;
    (chrome.runtime as { onMessage: unknown }).onMessage = runtimeOnMessage;

    registerHandlers();
  });

  afterEach(() => {
    (chrome.runtime as { onMessage: unknown }).onMessage = originalOnMessage;
    vi.clearAllMocks();
  });

  it("calls sendResponse with the loaded profile object", async () => {
    const profile = baseProfile();
    loadProfileMock.mockResolvedValue(profile);

    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    listener(
      { type: "profile:get" },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse.mock.calls[0]![0]).toBe(profile);
  });

  it("calls sendResponse with null when loadProfile throws", async () => {
    loadProfileMock.mockRejectedValue(new Error("storage unavailable"));

    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    listener(
      { type: "profile:get" },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse.mock.calls[0]![0]).toBeNull();
  });

  it("returns true (async response flag) for profile:get messages", () => {
    loadProfileMock.mockResolvedValue(baseProfile());

    const sendResponse = vi.fn();
    const listener = (runtimeOnMessage._listeners as MessageListener[])[0]!;
    const result = listener(
      { type: "profile:get" },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(true);
  });
});
