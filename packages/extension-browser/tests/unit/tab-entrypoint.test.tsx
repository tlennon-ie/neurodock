/**
 * @license AGPL-3.0-or-later
 *
 * Tab entrypoint mount + data-load smoke test.
 *
 * Asserts the full-tab view boots, loads the profile via the same
 * `loadProfile` helper the popup uses, and renders the history via the
 * same `listHistory` helper. This guarantees the "no data duplication"
 * constraint from the task spec — both surfaces read the same layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor, screen } from "@testing-library/react";
import * as storage from "../../src/lib/storage.js";
import * as profileModule from "../../src/lib/profile.js";
import { TabApp } from "../../entrypoints/tab/App.js";
import type { HistoryEntry, TranslationResponse } from "../../src/lib/types.js";

type ChromeMessageListener = (msg: unknown) => void;

function describeImageResponse(): TranslationResponse {
  return {
    ok: true,
    tool: "describe_image",
    data: {
      description: "A round avatar with a stylised brain motif.",
      contains_text: false,
      transcribed_text: null,
      key_elements: ["round avatar", "brain icon", "beige background"],
      inferred_purpose: "GitHub user avatar.",
      accessibility_notes: null,
      eval_corpus_slice: "describe_image-v0.1.0",
      model_provenance: {
        mode: "local",
        provider: "lmstudio",
        model: "gemma-4-e4b",
      },
    },
    error: null,
    mockMode: false,
    provenance: {
      mode: "local",
      provider: "lmstudio",
      model: "gemma-4-e4b",
    },
    timestamp: "2026-05-25T12:00:00.000Z",
  };
}

function buildEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  const response = describeImageResponse();
  return {
    id: "row-tab-1",
    tool: "describe_image",
    channel: null,
    timestamp: response.timestamp,
    mode: "local",
    mockMode: false,
    provider: "lmstudio",
    inputPreview: "https://example.com/avatar.png",
    outputSummary: "ok",
    request: {
      tool: "describe_image",
      input: {
        image_url: "https://example.com/avatar.png",
        page_url: "https://example.com/profile",
      },
    },
    response,
    ...overrides,
  };
}

describe("Tab entrypoint", () => {
  let originalOnMessage: typeof chrome.runtime.onMessage;
  let originalLocation: Location | undefined;

  beforeEach(() => {
    originalOnMessage = chrome.runtime.onMessage;
    (chrome.runtime as { onMessage: unknown }).onMessage = {
      addListener: (_l: ChromeMessageListener) => {},
      removeListener: (_l: ChromeMessageListener) => {},
    };
    vi.spyOn(profileModule, "loadProfile").mockResolvedValue({
      mode: "local",
      localProvider: "lmstudio",
      localEndpoint: "http://localhost:1234/v1",
      localModel: "gemma-4-e4b",
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
      onboardingComplete: true,
    });
    vi.spyOn(profileModule, "getSyncStatus").mockResolvedValue({
      source: "extension-local",
      nativeHostStatus: "absent",
      path: null,
      detail: null,
    });
    originalLocation = window.location;
    // Reset hash to "" before each test so default view is Home.
    window.location.hash = "";
  });

  afterEach(() => {
    (
      chrome.runtime as { onMessage: typeof chrome.runtime.onMessage }
    ).onMessage = originalOnMessage;
    if (originalLocation) {
      window.location.hash = "";
    }
    vi.restoreAllMocks();
  });

  it("renders without crashing and shows the tab shell", async () => {
    vi.spyOn(storage, "listHistory").mockResolvedValue([]);
    render(<TabApp />);
    expect(screen.getByTestId("app-shell-tab")).toBeInTheDocument();
    expect(screen.getByTestId("nd-header-wordmark")).toBeInTheDocument();
  });

  it("renders the shared header", async () => {
    vi.spyOn(storage, "listHistory").mockResolvedValue([]);
    render(<TabApp />);
    await waitFor(() => {
      expect(screen.getByTestId("nd-header-wordmark")).toBeInTheDocument();
    });
  });

  it("loads the profile via the shared loadProfile helper", async () => {
    vi.spyOn(storage, "listHistory").mockResolvedValue([]);
    render(<TabApp />);
    await waitFor(() => {
      expect(profileModule.loadProfile).toHaveBeenCalled();
    });
    // Profile identity test-id is rendered on the Home section after
    // the profile load resolves.
    await waitFor(() => {
      expect(screen.getByTestId("tab-profile-identity")).toBeInTheDocument();
    });
  });

  it("loads history via the shared listHistory helper and renders rows expanded by default", async () => {
    const listSpy = vi
      .spyOn(storage, "listHistory")
      .mockResolvedValue([buildEntry()]);
    render(<TabApp />);
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalled();
    });
    // Navigate to History section by clicking the side nav.
    const historyNav = screen.getByTestId("tab-nav-history");
    historyNav.click();
    await waitFor(() => {
      expect(screen.getByTestId("tab-history-section")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("tab-history-row")).toBeInTheDocument();
    });
    // The structured detail is rendered inline — no click required.
    expect(
      screen.getByText("A round avatar with a stylised brain motif."),
    ).toBeInTheDocument();
  });

  it("restores the requested view from the URL hash", async () => {
    vi.spyOn(storage, "listHistory").mockResolvedValue([]);
    window.location.hash = "#view=settings";
    render(<TabApp />);
    await waitFor(() => {
      expect(screen.getByTestId("tab-settings-section")).toBeInTheDocument();
    });
  });

  it("renders the real notifications inbox when nav points there", async () => {
    vi.spyOn(storage, "listHistory").mockResolvedValue([]);
    window.location.hash = "#view=notifications";
    render(<TabApp />);
    // 0.0.35: the placeholder was replaced by the shared NotificationsTab
    // inbox — the same component the popup uses, rendered over
    // src/lib/notifications.ts. Assert both the tab-view wrapper and the
    // reused inbox component are present.
    await waitFor(() => {
      expect(
        screen.getByTestId("tab-notifications-section"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("notifications-tab")).toBeInTheDocument();
  });
});
