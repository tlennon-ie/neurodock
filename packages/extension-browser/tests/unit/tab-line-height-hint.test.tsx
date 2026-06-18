/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * R5 line_height_hint — full-page tab surface wiring.
 *
 * When the loaded profile carries `lineHeightHint`, the tab view must
 * apply the matching `lh-*` class to <html> so tokens.css binds
 * --nd-body-line-height (>= 1.5). No hint → no lh-* class.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import * as storage from "../../src/lib/storage.js";
import * as profileModule from "../../src/lib/profile.js";
import { TabApp } from "../../entrypoints/tab/App.js";
import { LINE_HEIGHT_HINT_CLASSES } from "../../src/lib/line-height-hint.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

type ChromeMessageListener = (msg: unknown) => void;

function buildProfile(
  overrides: Partial<ExtensionProfile> = {},
): ExtensionProfile {
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
    onboardingComplete: true,
    ...overrides,
  };
}

describe("Tab — line_height_hint wiring (R5)", () => {
  let originalOnMessage: typeof chrome.runtime.onMessage;

  beforeEach(() => {
    document.documentElement.className = "";
    originalOnMessage = chrome.runtime.onMessage;
    (chrome.runtime as { onMessage: unknown }).onMessage = {
      addListener: (_l: ChromeMessageListener) => {},
      removeListener: (_l: ChromeMessageListener) => {},
    };
    vi.spyOn(profileModule, "getSyncStatus").mockResolvedValue({
      source: "extension-local",
      nativeHostStatus: "absent",
      path: null,
      detail: null,
    });
    vi.spyOn(storage, "listHistory").mockResolvedValue([]);
    window.location.hash = "";
  });

  afterEach(() => {
    (
      chrome.runtime as { onMessage: typeof chrome.runtime.onMessage }
    ).onMessage = originalOnMessage;
    window.location.hash = "";
    vi.restoreAllMocks();
  });

  it("applies lh-default to <html> when the profile carries the hint", async () => {
    vi.spyOn(profileModule, "loadProfile").mockResolvedValue(
      buildProfile({ lineHeightHint: "default" }),
    );
    render(<TabApp />);
    await waitFor(() => {
      expect(document.documentElement.classList.contains("lh-default")).toBe(
        true,
      );
    });
  });

  it("applies no lh-* class when the profile has no hint (back-compat)", async () => {
    vi.spyOn(profileModule, "loadProfile").mockResolvedValue(buildProfile());
    render(<TabApp />);
    await waitFor(() => {
      expect(profileModule.loadProfile).toHaveBeenCalled();
    });
    const present = LINE_HEIGHT_HINT_CLASSES.filter((c) =>
      document.documentElement.classList.contains(c),
    );
    expect(present).toEqual([]);
  });
});
