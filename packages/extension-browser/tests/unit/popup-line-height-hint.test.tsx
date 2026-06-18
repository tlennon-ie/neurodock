/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * R5 line_height_hint — popup surface wiring.
 *
 * When the loaded profile carries `lineHeightHint`, the popup must apply
 * the matching `lh-*` class to <html> so tokens.css binds
 * `--nd-body-line-height` (>= 1.5). When the profile carries no hint, no
 * lh-* class is applied (today's behaviour).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import * as profileModule from "../../src/lib/profile.js";
import * as storage from "../../src/lib/storage.js";
import * as nativeHost from "../../src/lib/native-host-client.js";
import { App } from "../../entrypoints/popup/App.js";
import { LINE_HEIGHT_HINT_CLASSES } from "../../src/lib/line-height-hint.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function completedProfile(
  overrides: Partial<ExtensionProfile> = {},
): ExtensionProfile {
  return {
    mode: "mock",
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

function mockProfile(profile: ExtensionProfile): void {
  vi.spyOn(profileModule, "loadProfile").mockResolvedValue(profile);
  vi.spyOn(profileModule, "getSyncStatus").mockResolvedValue({
    source: "extension-local",
    nativeHostStatus: "absent",
    path: null,
    detail: null,
  });
  vi.spyOn(storage, "listHistory").mockResolvedValue([]);
  vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
    status: "absent",
  });
}

describe("Popup — line_height_hint wiring (R5)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  afterEach(() => vi.restoreAllMocks());

  it("applies lh-relaxed to <html> when the profile has lineHeightHint=relaxed", async () => {
    mockProfile(completedProfile({ lineHeightHint: "relaxed" }));
    render(<App />);
    await waitFor(() => screen.getByTestId("tab-home"));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("lh-relaxed")).toBe(
        true,
      );
    });
  });

  it("applies no lh-* class when the profile has no hint (back-compat)", async () => {
    mockProfile(completedProfile());
    render(<App />);
    await waitFor(() => screen.getByTestId("tab-home"));
    const present = LINE_HEIGHT_HINT_CLASSES.filter((c) =>
      document.documentElement.classList.contains(c),
    );
    expect(present).toEqual([]);
  });
});
