/**
 * Regression test for the 0.0.7 fix to the silent right-click failure.
 *
 * Before 0.0.7, `entrypoints/_shared/bootstrap.tsx` claimed in its header
 * comment to "listen for context-menu result broadcasts" but never
 * actually registered a listener. The user's right-click "translate
 * selection" therefore arrived at the service worker, ran successfully
 * through LM Studio, and was broadcast via `chrome.tabs.sendMessage` —
 * but no content-script listener existed, so the browser silently
 * dropped the message and the user saw nothing.
 *
 * This test pins the contract:
 *   1. `ContentApp` registers a `chrome.runtime.onMessage` listener.
 *   2. When that listener receives a `neurodock:context-result` message,
 *      the result panel opens with the response and source text visible.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { ContentApp } from "../../entrypoints/_shared/contentApp.js";
import type {
  ExtensionProfile,
  RuntimeMessage,
  TranslationResponse,
} from "../../src/lib/types.js";

type ChromeMessageListener = (msg: unknown) => void;

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
  };
}

function successResponse(): TranslationResponse {
  return {
    ok: true,
    tool: "translate_incoming",
    data: {
      explicit_ask: "let's circle back on this",
      likely_subtext: [
        { text: "deferring without commitment", confidence: 0.7 },
      ],
      ambiguity: { detected: false, spans: [] },
      recommended_next_action: {
        action: "ask for a concrete date",
        reason: "vague language",
        draft_reply: null,
      },
      eval_corpus_slice: "circle_back",
      model_provenance: {
        mode: "local",
        provider: "lmstudio",
        model: "llama-3.2-3b-instruct",
      },
    },
    error: null,
    mockMode: false,
    provenance: {
      mode: "local",
      provider: "lmstudio",
      model: "llama-3.2-3b-instruct",
    },
    timestamp: "2026-05-23T10:00:00.000Z",
  };
}

describe("ContentApp — right-click context-menu result listener", () => {
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
  });

  afterEach(() => {
    (chrome.runtime as { onMessage: unknown }).onMessage = originalOnMessage;
  });

  it("registers a chrome.runtime.onMessage listener on mount", () => {
    render(
      <ContentApp
        channel="email"
        profile={baseProfile()}
        requestTranslate={vi.fn().mockResolvedValue(null)}
      />,
    );
    expect(capturedListeners.length).toBeGreaterThan(0);
  });

  it("opens the panel and renders the response when a context-menu result arrives", () => {
    render(
      <ContentApp
        channel="email"
        profile={baseProfile()}
        requestTranslate={vi.fn().mockResolvedValue(null)}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    const message: Extract<
      RuntimeMessage,
      { type: "neurodock:context-result" }
    > = {
      type: "neurodock:context-result",
      response: successResponse(),
      sourceText: "let's circle back on this Q3",
      channel: "email",
    };
    act(() => {
      for (const l of capturedListeners) l(message);
    });

    expect(
      screen.getByRole("dialog", { name: /NeuroDock translation result/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("context-source-preview").textContent).toContain(
      "circle back on this Q3",
    );
    // Response data rendered inside the panel's <pre> JSON dump.
    const dialog = screen.getByRole("dialog", {
      name: /NeuroDock translation result/i,
    });
    expect(dialog.textContent).toContain("deferring without commitment");
  });

  it("ignores messages of other types", () => {
    render(
      <ContentApp
        channel="email"
        profile={baseProfile()}
        requestTranslate={vi.fn().mockResolvedValue(null)}
      />,
    );
    act(() => {
      for (const l of capturedListeners) l({ type: "translate" });
      for (const l of capturedListeners) l({ type: "unknown-thing" });
      for (const l of capturedListeners) l(null);
      for (const l of capturedListeners) l("not an object");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
