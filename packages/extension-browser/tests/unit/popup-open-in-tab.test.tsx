/**
 * @license AGPL-3.0-or-later
 *
 * Popup → settings gear opens the full-page tab.
 *
 * Asserts that clicking the header settings gear calls
 * `chrome.tabs.create` with the URL returned by
 * `chrome.runtime.getURL("tab.html")` suffixed with `#view=settings`.
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

describe("Popup — settings gear opens full-page tab", () => {
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
      onboardingComplete: true,
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

  it("renders a settings gear in the popup header", async () => {
    render(<App />);
    expect(await screen.findByTestId("nd-header-settings")).toBeInTheDocument();
  });

  it("calls chrome.tabs.create with the tab.html URL when the gear is clicked", async () => {
    render(<App />);
    const gear = await screen.findByTestId("nd-header-settings");
    await act(async () => {
      fireEvent.click(gear);
    });
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
    const firstCall = createSpy.mock.calls[0];
    if (!firstCall) throw new Error("create not called");
    const args = firstCall[0] as { url: string };
    expect(args.url).toContain("tab.html");
    expect(args.url).toContain("view=settings");
  });

  it("gear deep-links to settings from the Notifications tab as well", async () => {
    // Task F1: Settings tab removed from popup. Verify gear works from any
    // remaining popup tab (switch to Notifications, then click gear).
    render(<App />);
    const notificationsTab = await screen.findByTestId("tab-notifications");
    await act(async () => {
      fireEvent.click(notificationsTab);
    });
    const gear = await screen.findByTestId("nd-header-settings");
    await act(async () => {
      fireEvent.click(gear);
    });
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    const firstCall = createSpy.mock.calls[0];
    if (!firstCall) throw new Error("create not called");
    const args = firstCall[0] as { url: string };
    expect(args.url).toContain("tab.html");
    expect(args.url).toContain("view=settings");
  });
});
