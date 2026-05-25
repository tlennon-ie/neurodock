/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Settings → Pacing copilot section.
 *
 * Renders the section, toggles the three preferences, asserts the new
 * shape lands in chrome.storage.local["neurodock.pacing.v1"].
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsTab } from "../../entrypoints/popup/SettingsTab.js";
import { PACING_PREFS_STORAGE_KEY } from "../../src/lib/pacing.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function baseProfile(
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
    ...overrides,
  };
}

async function clearStorage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome: { storage: { local: { clear: () => Promise<void> } } };
  };
  await g.chrome.storage.local.clear();
}

async function readPacingStored(): Promise<unknown> {
  const g = globalThis as unknown as {
    chrome: {
      storage: {
        local: {
          get: (keys: string | string[]) => Promise<Record<string, unknown>>;
        };
      };
    };
  };
  const out = await g.chrome.storage.local.get(PACING_PREFS_STORAGE_KEY);
  return out[PACING_PREFS_STORAGE_KEY];
}

describe("Settings → Pacing copilot section", () => {
  beforeEach(async () => {
    await clearStorage();
  });

  it("renders the section with neutral defaults for non-OCD users", async () => {
    render(
      <SettingsTab
        profile={baseProfile({ neurotypes: ["adhd"] })}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const fieldset = await screen.findByTestId("pacing-copilot");
    expect(fieldset).toBeInTheDocument();
    const toggle = await screen.findByTestId("pacing-enabled-toggle");
    expect((toggle as HTMLInputElement).checked).toBe(true);
    const interval = await screen.findByTestId("pacing-interval-select");
    expect((interval as HTMLSelectElement).value).toBe("45");
  });

  it("renders the section disabled by default for OCD users", async () => {
    render(
      <SettingsTab
        profile={baseProfile({ neurotypes: ["ocd"] })}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const toggle = await screen.findByTestId("pacing-enabled-toggle");
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

  it("persists a flip of intervalMinutes to chrome.storage.local", async () => {
    render(
      <SettingsTab
        profile={baseProfile()}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const select = await screen.findByTestId("pacing-interval-select");
    fireEvent.change(select, { target: { value: "30" } });
    await waitFor(async () => {
      const stored = await readPacingStored();
      expect(
        (stored as { preferences: { intervalMinutes: number } }).preferences
          .intervalMinutes,
      ).toBe(30);
    });
  });

  it("flipping the master toggle records ocdOptInShown=true", async () => {
    render(
      <SettingsTab
        profile={baseProfile({ neurotypes: ["ocd"] })}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const toggle = await screen.findByTestId("pacing-enabled-toggle");
    fireEvent.click(toggle);
    await waitFor(async () => {
      const stored = await readPacingStored();
      const prefs = (
        stored as { preferences: { enabled: boolean; ocdOptInShown: boolean } }
      ).preferences;
      expect(prefs.enabled).toBe(true);
      expect(prefs.ocdOptInShown).toBe(true);
    });
  });

  it("flipping the timebox-on-start toggle persists the new value", async () => {
    render(
      <SettingsTab
        profile={baseProfile()}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const toggle = await screen.findByTestId("pacing-timebox-toggle");
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(async () => {
      const stored = await readPacingStored();
      expect(
        (stored as { preferences: { timeboxOnStart: boolean } }).preferences
          .timeboxOnStart,
      ).toBe(false);
    });
  });
});
