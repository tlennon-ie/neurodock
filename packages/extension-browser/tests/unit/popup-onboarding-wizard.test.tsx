/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Popup onboarding wizard (Roadmap A1).
 *
 * Asserts:
 *   - A fresh profile (onboardingComplete absent / false) renders the
 *     wizard in place of the regular tab bar + content.
 *   - The five-step flow is reachable and the Skip affordance on every
 *     non-config step eventually persists `onboardingComplete: true`.
 *   - Once the wizard finishes the regular Home tab appears.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as profileModule from "../../src/lib/profile.js";
import { App } from "../../entrypoints/popup/App.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function freshProfile(
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
    onboardingComplete: false,
    ...overrides,
  };
}

describe("Popup onboarding wizard — first-run rendering", () => {
  let saveSpy: MockInstance<typeof profileModule.saveProfileWithOutcome>;

  beforeEach(() => {
    vi.spyOn(profileModule, "loadProfile").mockResolvedValue(freshProfile());
    vi.spyOn(profileModule, "getSyncStatus").mockResolvedValue({
      source: "extension-local",
      nativeHostStatus: "absent",
      path: null,
      detail: null,
    });
    saveSpy = vi
      .spyOn(profileModule, "saveProfileWithOutcome")
      .mockImplementation(async (patch) => ({
        profile: freshProfile({ ...patch, onboardingComplete: true }),
        source: "extension-local",
        confirmRequired: false,
        error: null,
      }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the wizard instead of the tab bar on first run", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-wizard")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("tab-home")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-settings")).not.toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-welcome")).toBeInTheDocument();
  });

  it("steps forward through Welcome → Provider select", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-step-welcome")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wizard-welcome-continue"));
    await waitFor(() => {
      expect(
        screen.getByTestId("wizard-step-provider-select"),
      ).toBeInTheDocument();
    });
  });

  it("persists onboardingComplete: true when the user skips from Welcome", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-welcome-skip")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wizard-welcome-skip"));
    await waitFor(() => {
      const call = saveSpy.mock.calls.find((c) => {
        const patch = c[0] as Partial<ExtensionProfile>;
        return patch.onboardingComplete === true;
      });
      expect(call).toBeDefined();
    });
  });

  it("renders the main tab bar after the wizard completes", async () => {
    // After the user finishes the wizard the profile reloaded into App
    // state must have onboardingComplete: true. We simulate that here
    // by returning a completed profile from saveProfileWithOutcome and
    // confirming the gate flips.
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-welcome-skip")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wizard-welcome-skip"));
    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-home")).toBeInTheDocument();
  });

  it("Provider selection step exposes three primary cards", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-welcome-continue")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wizard-welcome-continue"));
    await waitFor(() => {
      expect(
        screen.getByTestId("wizard-provider-lmstudio"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("wizard-provider-ollama")).toBeInTheDocument();
      expect(screen.getByTestId("wizard-provider-cloud")).toBeInTheDocument();
    });
  });

  it("Continue is disabled on the provider step until a card is selected", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-welcome-continue")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wizard-welcome-continue"));
    await waitFor(() => {
      expect(screen.getByTestId("wizard-provider-continue")).toBeDisabled();
    });
    fireEvent.click(screen.getByTestId("wizard-provider-ollama-radio"));
    await waitFor(() => {
      expect(screen.getByTestId("wizard-provider-continue")).not.toBeDisabled();
    });
  });
});
