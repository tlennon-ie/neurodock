/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Popup notifications inbox refreshes when the SW broadcasts
 * `notifications:updated`. Mirrors the existing
 * popup-history-live-update test for the history list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
  render,
  waitFor,
  act,
  screen,
  fireEvent,
} from "@testing-library/react";
import * as notifications from "../../src/lib/notifications.js";
import * as profileModule from "../../src/lib/profile.js";
import { App } from "../../entrypoints/popup/App.js";

type ChromeMessageListener = (msg: unknown) => void;
type ListSpy = ReturnType<
  typeof notifications.listNotifications
> extends Promise<infer R>
  ? import("vitest").MockInstance<(limit?: number) => Promise<R>>
  : never;

async function clearStorage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome: { storage: { local: { clear: () => Promise<void> } } };
  };
  await g.chrome.storage.local.clear();
}

describe("Popup — live notifications inbox updates", () => {
  let capturedListeners: ChromeMessageListener[];
  let originalOnMessage: typeof chrome.runtime.onMessage;
  let listSpy: ListSpy;

  beforeEach(async () => {
    await clearStorage();
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
    listSpy = vi.spyOn(notifications, "listNotifications");
  });

  afterEach(() => {
    (chrome.runtime as { onMessage: unknown }).onMessage = originalOnMessage;
    vi.restoreAllMocks();
  });

  it("calls listNotifications again when notifications:updated fires", async () => {
    render(<App />);
    // Switch to the Notifications tab so the component mounts.
    await waitFor(() => screen.getByTestId("tab-notifications"));
    fireEvent.click(screen.getByTestId("tab-notifications"));
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    const initialCalls = listSpy.mock.calls.length;

    await act(async () => {
      for (const l of capturedListeners) l({ type: "notifications:updated" });
    });

    await waitFor(() => {
      expect(listSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  it("ignores other broadcast types", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("tab-notifications"));
    fireEvent.click(screen.getByTestId("tab-notifications"));
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    const initialCalls = listSpy.mock.calls.length;

    await act(async () => {
      for (const l of capturedListeners) l({ type: "history:updated" });
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(listSpy.mock.calls.length).toBe(initialCalls);
  });
});
