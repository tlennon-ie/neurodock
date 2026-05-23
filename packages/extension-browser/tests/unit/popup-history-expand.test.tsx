/**
 * 0.0.21 — History rows in the popup must be click-to-expand and render
 * the structured result, not just a metadata line. Before 0.0.21 the
 * row was a static `<li>` and notifications pointing users to History
 * led to a dead-end list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
  render,
  waitFor,
  screen,
  fireEvent,
  act,
} from "@testing-library/react";
import * as storage from "../../src/lib/storage.js";
import * as profileModule from "../../src/lib/profile.js";
import { App } from "../../entrypoints/popup/App.js";
import type { HistoryEntry, TranslationResponse } from "../../src/lib/types.js";

type ChromeMessageListener = (msg: unknown) => void;

describe("Popup — History row click-to-expand", () => {
  let capturedListeners: ChromeMessageListener[];
  let originalOnMessage: typeof chrome.runtime.onMessage;

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
      localModel: "gemma-4-e4b",
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
    });
    vi.spyOn(profileModule, "getSyncStatus").mockResolvedValue({
      source: "extension-local",
      nativeHostStatus: "absent",
      path: null,
      detail: null,
    });
  });

  afterEach(() => {
    (
      chrome.runtime as { onMessage: typeof chrome.runtime.onMessage }
    ).onMessage = originalOnMessage;
    vi.restoreAllMocks();
  });

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
      timestamp: "2026-05-23T22:43:13.745Z",
    };
  }

  function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
    const response = describeImageResponse();
    return {
      id: "row-1",
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

  it("renders the structured description when a row is expanded", async () => {
    vi.spyOn(storage, "listHistory").mockResolvedValue([entry()]);
    render(<App />);
    const toggle = await screen.findByTestId(
      "history-row-toggle-describe_image",
    );
    expect(screen.queryByTestId("history-row-detail")).toBeNull();
    await act(async () => {
      fireEvent.click(toggle);
    });
    await waitFor(() => {
      expect(screen.getByTestId("history-row-detail")).toBeInTheDocument();
    });
    // The actual description text rendered by ImageDescribeView (the
    // TldrCard pulls from `data.description`).
    expect(
      screen.getByText("A round avatar with a stylised brain motif."),
    ).toBeInTheDocument();
    // Source preview shows the image URL too.
    expect(screen.getByTestId("context-source-preview")).toBeInTheDocument();
  });

  it("collapses an already-open row on second click", async () => {
    vi.spyOn(storage, "listHistory").mockResolvedValue([entry()]);
    render(<App />);
    const toggle = await screen.findByTestId(
      "history-row-toggle-describe_image",
    );
    await act(async () => {
      fireEvent.click(toggle);
    });
    await waitFor(() => {
      expect(screen.getByTestId("history-row-detail")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(toggle);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("history-row-detail")).toBeNull();
    });
  });

  it("rows without a saved response are inert (legacy entries pre-0.0.21)", async () => {
    const legacy = entry({ response: undefined, request: undefined });
    vi.spyOn(storage, "listHistory").mockResolvedValue([legacy]);
    render(<App />);
    const toggle = await screen.findByTestId(
      "history-row-toggle-describe_image",
    );
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
  });
});
