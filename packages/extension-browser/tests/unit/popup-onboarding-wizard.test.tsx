/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Popup onboarding wizard — identity-first flow (Tasks E1+E2+E3).
 *
 * Asserts:
 *   - A fresh profile (onboardingComplete absent / false) renders the
 *     wizard in place of the regular tab bar + content.
 *   - The identity → model → done step machine works end-to-end.
 *   - Skip from identity persists onboardingComplete and returns home.
 *   - Local-model detection offers a one-tap connect button.
 *   - Done step shows PowerUpCard and finishes to home.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as profileModule from "../../src/lib/profile.js";
import * as detect from "../../src/lib/detect-local-model.js";
import * as nativeHost from "../../src/lib/native-host-client.js";
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

describe("Popup onboarding wizard — identity-first flow", () => {
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
        // Only propagate onboardingComplete: true when the patch explicitly sets it.
        // Otherwise App would immediately flip onboardingComplete and close the wizard
        // whenever the identity step persists reader prefs.
        profile: freshProfile({ ...patch }),
        source: "extension-local",
        confirmRequired: false,
        error: null,
      }));
    // Default: no local model detected (so model step shows cloud path)
    vi.spyOn(detect, "detectLocalModel").mockResolvedValue(null);
    // PowerUpCard polls probeNativeHost — mock it to stay quiet
    vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
      status: "absent",
    });
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
  });

  it("opens on the identity step (how you read)", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("wizard-step-identity")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("reader-prefs-neurotypes")).toBeInTheDocument();
    // reader-font-select also appears in the header — getAllByTestId tolerates duplicates
    expect(screen.getAllByTestId("reader-font-select").length).toBeGreaterThan(
      0,
    );
  });

  it("advances identity → model", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-continue"));
    fireEvent.click(screen.getByTestId("wizard-identity-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("wizard-step-model")).toBeInTheDocument(),
    );
  });

  it("persists onboardingComplete on skip from identity", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-skip"));
    fireEvent.click(screen.getByTestId("wizard-identity-skip"));
    await waitFor(() => {
      const call = saveSpy.mock.calls.find(
        (c) => (c[0] as Partial<ExtensionProfile>).onboardingComplete === true,
      );
      expect(call).toBeDefined();
    });
  });

  it("renders the main tab bar after skipping from identity", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-skip"));
    fireEvent.click(screen.getByTestId("wizard-identity-skip"));
    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-home")).toBeInTheDocument();
  });

  it("offers one-tap local connect when a local model is detected", async () => {
    vi.spyOn(detect, "detectLocalModel").mockResolvedValue({
      provider: "lmstudio",
      endpoint: "http://localhost:1234/v1",
    });
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-continue"));
    fireEvent.click(screen.getByTestId("wizard-identity-continue"));
    await waitFor(() =>
      expect(
        screen.getByTestId("wizard-model-connect-local"),
      ).toBeInTheDocument(),
    );
  });

  it("does not show wizard-model-connect-local when no local model is detected", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-continue"));
    fireEvent.click(screen.getByTestId("wizard-identity-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("wizard-step-model")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("wizard-model-connect-local"),
    ).not.toBeInTheDocument();
  });

  it("done step shows the power-up card and finishes to home", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-continue"));
    fireEvent.click(screen.getByTestId("wizard-identity-continue"));
    await waitFor(() => screen.getByTestId("wizard-step-model"));
    fireEvent.click(screen.getByTestId("wizard-model-skip"));
    await waitFor(() => {
      expect(screen.getByTestId("wizard-step-done")).toBeInTheDocument();
      expect(screen.getByTestId("power-up-command")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wizard-finish"));
    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
      expect(screen.getByTestId("tab-home")).toBeInTheDocument();
    });
  });

  it("back from model returns to identity", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-continue"));
    fireEvent.click(screen.getByTestId("wizard-identity-continue"));
    await waitFor(() => screen.getByTestId("wizard-step-model"));
    fireEvent.click(screen.getByTestId("wizard-model-back"));
    await waitFor(() =>
      expect(screen.getByTestId("wizard-step-identity")).toBeInTheDocument(),
    );
  });

  it("persists onboardingComplete when wizard-finish is clicked", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("wizard-identity-continue"));
    fireEvent.click(screen.getByTestId("wizard-identity-continue"));
    await waitFor(() => screen.getByTestId("wizard-step-model"));
    fireEvent.click(screen.getByTestId("wizard-model-skip"));
    await waitFor(() => screen.getByTestId("wizard-finish"));
    fireEvent.click(screen.getByTestId("wizard-finish"));
    await waitFor(() => {
      const call = saveSpy.mock.calls.find(
        (c) => (c[0] as Partial<ExtensionProfile>).onboardingComplete === true,
      );
      expect(call).toBeDefined();
    });
  });
});
