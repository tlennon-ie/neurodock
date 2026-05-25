/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Popup home → Pacing copilot one-time opt-in prompt (RFC B3).
 *
 * Pacing prompts can feed rumination loops for OCD / AuDHD users, so
 * the prompt is default OFF and the popup must explicitly ask before
 * any nudges fire. After either Enable or Not now the prompt sets
 * `ocdOptInShown=true` so it does not render again.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PacingOptInPrompt } from "../../entrypoints/popup/App.js";
import {
  PACING_PREFS_STORAGE_KEY,
  savePacingPreferences,
} from "../../src/lib/pacing.js";
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

async function readPrefs(): Promise<{
  preferences: { enabled: boolean; ocdOptInShown: boolean };
} | null> {
  const g = globalThis as unknown as {
    chrome: {
      storage: {
        local: {
          get: (k: string) => Promise<Record<string, unknown>>;
        };
      };
    };
  };
  const out = await g.chrome.storage.local.get(PACING_PREFS_STORAGE_KEY);
  return (
    (out[PACING_PREFS_STORAGE_KEY] as
      | {
          preferences: { enabled: boolean; ocdOptInShown: boolean };
        }
      | undefined) ?? null
  );
}

describe("PacingOptInPrompt", () => {
  beforeEach(async () => {
    await clearStorage();
  });

  it("does not render for a user without ocd / audhd", async () => {
    render(
      <PacingOptInPrompt profile={baseProfile({ neurotypes: ["adhd"] })} />,
    );
    // The component is async — wait long enough for prefs to load, then
    // assert nothing rendered.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("pacing-opt-in-prompt")).toBeNull();
  });

  it("renders for an OCD user with ocdOptInShown=false (first run)", async () => {
    render(
      <PacingOptInPrompt profile={baseProfile({ neurotypes: ["ocd"] })} />,
    );
    const prompt = await screen.findByTestId("pacing-opt-in-prompt");
    expect(prompt).toBeInTheDocument();
  });

  it("renders for an AuDHD user with ocdOptInShown=false", async () => {
    render(
      <PacingOptInPrompt profile={baseProfile({ neurotypes: ["audhd"] })} />,
    );
    const prompt = await screen.findByTestId("pacing-opt-in-prompt");
    expect(prompt).toBeInTheDocument();
  });

  it("Enable sets enabled=true AND ocdOptInShown=true, then the prompt no longer renders", async () => {
    const { rerender } = render(
      <PacingOptInPrompt profile={baseProfile({ neurotypes: ["ocd"] })} />,
    );
    const enableButton = await screen.findByTestId("pacing-opt-in-enable");
    fireEvent.click(enableButton);
    await waitFor(async () => {
      const stored = await readPrefs();
      expect(stored?.preferences.enabled).toBe(true);
      expect(stored?.preferences.ocdOptInShown).toBe(true);
    });
    expect(screen.queryByTestId("pacing-opt-in-prompt")).toBeNull();

    // A subsequent mount sees the persisted ocdOptInShown=true and
    // suppresses the prompt.
    rerender(
      <PacingOptInPrompt profile={baseProfile({ neurotypes: ["ocd"] })} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("pacing-opt-in-prompt")).toBeNull();
  });

  it("Not now sets enabled=false BUT ocdOptInShown=true, then the prompt no longer renders", async () => {
    render(
      <PacingOptInPrompt profile={baseProfile({ neurotypes: ["ocd"] })} />,
    );
    const dismissButton = await screen.findByTestId("pacing-opt-in-dismiss");
    fireEvent.click(dismissButton);
    await waitFor(async () => {
      const stored = await readPrefs();
      expect(stored?.preferences.enabled).toBe(false);
      expect(stored?.preferences.ocdOptInShown).toBe(true);
    });
    expect(screen.queryByTestId("pacing-opt-in-prompt")).toBeNull();
  });

  it("does not render when ocdOptInShown is already true (persisted)", async () => {
    await savePacingPreferences({
      enabled: false,
      intervalMinutes: 45,
      timeboxOnStart: true,
      ocdOptInShown: true,
      schemaVersion: 1,
    });
    render(
      <PacingOptInPrompt profile={baseProfile({ neurotypes: ["ocd"] })} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("pacing-opt-in-prompt")).toBeNull();
  });
});
