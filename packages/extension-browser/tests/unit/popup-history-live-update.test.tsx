/**
 * Regression test for the 0.0.7 fix to the popup history blind spot.
 *
 * Before 0.0.7 the popup ran `listHistory(20)` once on mount and never
 * again. A translation that completed while the popup was open never
 * appeared until the user closed and re-opened it. The user's
 * "nothing in the extension" complaint included this surface.
 *
 * Fix: service worker broadcasts `chrome.runtime.sendMessage({ type:
 * "history:updated" })` after every successful `appendHistory`, and the
 * popup listens for it and refreshes the history list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor, act } from "@testing-library/react";
import * as storage from "../../src/lib/storage.js";
import * as profileModule from "../../src/lib/profile.js";
import { App } from "../../entrypoints/popup/App.js";

type ChromeMessageListener = (msg: unknown) => void;

describe("Popup — live history updates via history:updated message", () => {
  let capturedListeners: ChromeMessageListener[];
  let originalOnMessage: typeof chrome.runtime.onMessage;
  let listHistorySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    capturedListeners = [];
    originalOnMessage = chrome.runtime.onMessage;
    (chrome.runtime as { onMessage: unknown }).onMessage = {
      addListener: (l: ChromeMessageListener) => {
        capturedListeners.push(l);
      },
      removeListener: (l: ChromeMessageListener) => {
        const i = capturedListeners.indexOf(l);
        if (i !== -1) capturedListeners.splice(i, 1);
      },
    };
    vi.spyOn(profileModule, "loadProfile").mockResolvedValue({
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
    });
    vi.spyOn(profileModule, "getSyncStatus").mockResolvedValue({
      source: "extension-local",
      detail: null,
    });
    listHistorySpy = vi.spyOn(storage, "listHistory").mockResolvedValue([]);
  });

  afterEach(() => {
    (chrome.runtime as { onMessage: unknown }).onMessage = originalOnMessage;
    vi.restoreAllMocks();
  });

  it("calls listHistory again when history:updated fires", async () => {
    render(<App />);
    await waitFor(() => expect(listHistorySpy).toHaveBeenCalled());
    const initialCalls = listHistorySpy.mock.calls.length;

    await act(async () => {
      for (const l of capturedListeners) l({ type: "history:updated" });
    });

    await waitFor(() => {
      expect(listHistorySpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  it("ignores history:updated when history is disabled in the profile", async () => {
    (
      profileModule.loadProfile as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      mode: "local",
      localProvider: "lmstudio",
      localEndpoint: "http://localhost:1234/v1",
      localModel: "llama-3.2-3b-instruct",
      localApiKey: null,
      cloudProvider: null,
      cloudModel: null,
      cloudApiKey: null,
      historyEnabled: false,
      displayName: "you",
    });
    render(<App />);
    // Wait for the initial mount effect to settle.
    await waitFor(() =>
      expect(
        (profileModule.loadProfile as unknown as ReturnType<typeof vi.fn>).mock
          .calls.length,
      ).toBe(1),
    );
    const callsBefore = listHistorySpy.mock.calls.length;

    await act(async () => {
      for (const l of capturedListeners) l({ type: "history:updated" });
    });

    // Give any errant refresh a tick to land.
    await new Promise((r) => setTimeout(r, 20));
    expect(listHistorySpy.mock.calls.length).toBe(callsBefore);
  });
});
