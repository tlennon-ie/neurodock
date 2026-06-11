/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as profileModule from "../../src/lib/profile.js";
import { App } from "../../entrypoints/popup/App.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function completedProfile(): ExtensionProfile {
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
  };
}

describe("popup header", () => {
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
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the shared header with the font switcher and a settings gear", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("nd-header-wordmark")).toBeInTheDocument();
    });
    expect(screen.getByTestId("reader-font-select")).toBeInTheDocument();
    expect(screen.getByTestId("nd-header-settings")).toBeInTheDocument();
  });
});
