/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Pacing-copilot OCD / AuDHD opt-in default.
 *
 * Pacing prompts can feed rumination loops for OCD / AuDHD users, so
 * `loadPacingPreferences` MUST default to enabled=false for those
 * neurotypes (and ocdOptInShown=false until the popup surfaces the
 * one-time prompt). Every other neurotype combination defaults to
 * enabled=true with the standard 45-minute interval.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_PACING_INTERVAL,
  defaultPreferencesForNeurotypes,
  hasOcdOrAudhd,
  loadPacingPreferences,
  savePacingPreferences,
} from "../../src/lib/pacing.js";

async function clearStorage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome: { storage: { local: { clear: () => Promise<void> } } };
  };
  await g.chrome.storage.local.clear();
}

describe("hasOcdOrAudhd", () => {
  it("returns true for ocd alone", () => {
    expect(hasOcdOrAudhd(["ocd"])).toBe(true);
  });
  it("returns true for audhd alone", () => {
    expect(hasOcdOrAudhd(["audhd"])).toBe(true);
  });
  it("returns true when ocd is alongside other neurotypes", () => {
    expect(hasOcdOrAudhd(["adhd", "ocd"])).toBe(true);
  });
  it("returns false for adhd alone", () => {
    expect(hasOcdOrAudhd(["adhd"])).toBe(false);
  });
  it("returns false for asd alone", () => {
    expect(hasOcdOrAudhd(["asd"])).toBe(false);
  });
  it("returns false for empty neurotypes", () => {
    expect(hasOcdOrAudhd([])).toBe(false);
  });
});

describe("defaultPreferencesForNeurotypes", () => {
  it("returns enabled=true for adhd users", () => {
    const p = defaultPreferencesForNeurotypes(["adhd"]);
    expect(p.enabled).toBe(true);
    expect(p.intervalMinutes).toBe(DEFAULT_PACING_INTERVAL);
    expect(p.ocdOptInShown).toBe(true);
  });

  it("returns enabled=false for ocd users (opt-in required)", () => {
    const p = defaultPreferencesForNeurotypes(["ocd"]);
    expect(p.enabled).toBe(false);
    expect(p.ocdOptInShown).toBe(false);
    expect(p.timeboxOnStart).toBe(false);
  });

  it("returns enabled=false for audhd users (opt-in required)", () => {
    const p = defaultPreferencesForNeurotypes(["audhd"]);
    expect(p.enabled).toBe(false);
    expect(p.ocdOptInShown).toBe(false);
  });

  it("returns enabled=true for empty neurotypes", () => {
    const p = defaultPreferencesForNeurotypes([]);
    expect(p.enabled).toBe(true);
    expect(p.ocdOptInShown).toBe(true);
  });
});

describe("loadPacingPreferences (defaults from storage)", () => {
  beforeEach(async () => {
    await clearStorage();
  });

  it("returns the OCD defaults on first run for an OCD user", async () => {
    const p = await loadPacingPreferences(["ocd"]);
    expect(p.enabled).toBe(false);
    expect(p.ocdOptInShown).toBe(false);
  });

  it("returns the AuDHD defaults on first run for an AuDHD user", async () => {
    const p = await loadPacingPreferences(["audhd"]);
    expect(p.enabled).toBe(false);
  });

  it("returns the neutral defaults on first run for an ADHD user", async () => {
    const p = await loadPacingPreferences(["adhd"]);
    expect(p.enabled).toBe(true);
    expect(p.intervalMinutes).toBe(DEFAULT_PACING_INTERVAL);
  });

  it("round-trips preferences through chrome.storage.local", async () => {
    await savePacingPreferences({
      enabled: true,
      intervalMinutes: 30,
      timeboxOnStart: false,
      ocdOptInShown: true,
      schemaVersion: 1,
    });
    // Note: once persisted, the stored value wins even for OCD users —
    // their explicit opt-in must be honoured.
    const p = await loadPacingPreferences(["ocd"]);
    expect(p.enabled).toBe(true);
    expect(p.intervalMinutes).toBe(30);
    expect(p.timeboxOnStart).toBe(false);
    expect(p.ocdOptInShown).toBe(true);
  });
});
