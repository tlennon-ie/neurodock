/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Task F1 — lean popup tab bar.
 *
 * Asserts that the popup renders exactly two tabs (Home + Notifications)
 * and that the Settings tab is absent from the popup tab bar. Settings
 * is reachable only via the header gear (nd-header-settings) which
 * opens the full-page tab.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import * as profileModule from "../../src/lib/profile.js";
import * as storage from "../../src/lib/storage.js";
import * as nativeHost from "../../src/lib/native-host-client.js";
import { App } from "../../entrypoints/popup/App.js";
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

describe("Popup tab bar — lean two-tab layout (Task F1)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(profileModule, "loadProfile").mockResolvedValue(
      completedProfile(),
    );
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
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders only Home and Notifications tabs; Settings is a gear to the full page", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("tab-home"));
    expect(screen.getByTestId("tab-notifications")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-settings")).not.toBeInTheDocument();
    expect(screen.getByTestId("nd-header-settings")).toBeInTheDocument();
  });
});
