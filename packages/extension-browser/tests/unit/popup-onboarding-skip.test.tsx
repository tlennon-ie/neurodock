/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Roadmap A1: existing users (profile.onboardingComplete === true) must
 * NEVER see the wizard. The popup tab bar must render immediately.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import * as profileModule from "../../src/lib/profile.js";
import * as storage from "../../src/lib/storage.js";
import { App } from "../../entrypoints/popup/App.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function completedProfile(
  overrides: Partial<ExtensionProfile> = {},
): ExtensionProfile {
  return {
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
    ...overrides,
  };
}

describe("Popup onboarding wizard — skipped for existing users", () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render the wizard when onboardingComplete === true", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("tab-home")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("wizard-step-identity"),
    ).not.toBeInTheDocument();
  });

  it("renders the main tab bar immediately on mount", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("tab-home")).toBeInTheDocument();
      expect(screen.getByTestId("tab-notifications")).toBeInTheDocument();
      expect(screen.getByTestId("tab-settings")).toBeInTheDocument();
    });
  });
});
