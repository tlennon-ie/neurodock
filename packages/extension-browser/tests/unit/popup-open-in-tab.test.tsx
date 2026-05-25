/**
 * @license AGPL-3.0-or-later
 *
 * Popup → Open in tab button.
 *
 * Asserts that clicking the header "Open in tab" control calls
 * `chrome.tabs.create` with the URL returned by
 * `chrome.runtime.getURL("tab.html")`, optionally suffixed with the
 * currently-active popup view as `#view=…`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import * as storage from "../../src/lib/storage.js";
import * as profileModule from "../../src/lib/profile.js";
import { App } from "../../entrypoints/popup/App.js";

type ChromeMessageListener = (msg: unknown) => void;

describe("Popup — Open in tab", () => {
  let originalOnMessage: typeof chrome.runtime.onMessage;
  let originalTabs: typeof chrome.tabs;
  let originalRuntime: typeof chrome.runtime;
  let createSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalOnMessage = chrome.runtime.onMessage;
    originalTabs = chrome.tabs;
    originalRuntime = chrome.runtime;
    (chrome.runtime as { onMessage: unknown }).onMessage = {
      addListener: (_l: ChromeMessageListener) => {},
      removeListener: (_l: ChromeMessageListener) => {},
    };
    // Inject getURL + tabs.create so the click handler has the same
    // shape it would in the real extension runtime.
    createSpy = vi.fn();
    (chrome as { runtime: unknown }).runtime = {
      ...originalRuntime,
      onMessage: chrome.runtime.onMessage,
      getURL: (path: string) =>
        `chrome-extension://test-id/${path.replace(/^\//, "")}`,
    };
    (chrome as { tabs: unknown }).tabs = {
      ...originalTabs,
      create: createSpy,
    };
    vi.spyOn(profileModule, "loadProfile").mockResolvedValue({
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
    });
    vi.spyOn(profileModule, "getSyncStatus").mockResolvedValue({
      source: "extension-local",
      nativeHostStatus: "absent",
      path: null,
      detail: null,
    });
    vi.spyOn(storage, "listHistory").mockResolvedValue([]);
  });

  afterEach(() => {
    (
      chrome.runtime as { onMessage: typeof chrome.runtime.onMessage }
    ).onMessage = originalOnMessage;
    (chrome as { tabs: typeof chrome.tabs }).tabs = originalTabs;
    (chrome as { runtime: typeof chrome.runtime }).runtime = originalRuntime;
    vi.restoreAllMocks();
  });

  it("renders an Open in tab button in the popup header", async () => {
    render(<App />);
    expect(await screen.findByTestId("open-in-tab-button")).toBeInTheDocument();
  });

  it("calls chrome.tabs.create with the tab.html URL when clicked", async () => {
    render(<App />);
    const btn = await screen.findByTestId("open-in-tab-button");
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
    const firstCall = createSpy.mock.calls[0];
    if (!firstCall) throw new Error("create not called");
    const args = firstCall[0] as { url: string };
    expect(args.url).toBe("chrome-extension://test-id/tab.html#view=home");
  });

  it("encodes the currently-active popup tab into the URL hash", async () => {
    render(<App />);
    // Switch to the Settings tab in the popup, then click Open in tab.
    const settingsTab = await screen.findByTestId("tab-settings");
    await act(async () => {
      fireEvent.click(settingsTab);
    });
    const btn = await screen.findByTestId("open-in-tab-button");
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    const firstCall = createSpy.mock.calls[0];
    if (!firstCall) throw new Error("create not called");
    const args = firstCall[0] as { url: string };
    expect(args.url).toBe("chrome-extension://test-id/tab.html#view=settings");
  });
});
