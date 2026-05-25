/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Notifications inbox — per-category mute resolution.
 *
 * Verifies relative-duration parsing ("4h", "30m"), explicit-ISO mutes,
 * permanent mutes (`until = null`), expiry, sub-category targeting, and
 * the clearMute escape hatch.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setMute,
  isMuted,
  clearMute,
  listMutes,
  _setClockForTests,
  _resetClockForTests,
} from "../../src/lib/notifications.js";

async function clearStorage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome: { storage: { local: { clear: () => Promise<void> } } };
  };
  await g.chrome.storage.local.clear();
}

describe("notification mutes", () => {
  beforeEach(async () => {
    await clearStorage();
    _resetClockForTests();
  });

  it("a category is not muted by default", async () => {
    expect(await isMuted("watchdog")).toBe(false);
  });

  it("setMute with a relative '4h' duration mutes until that point", async () => {
    const now = 1_700_000_000_000;
    _setClockForTests(() => new Date(now));
    await setMute("watchdog", "4h");
    expect(await isMuted("watchdog")).toBe(true);
    // Advance just shy of 4h → still muted.
    _setClockForTests(() => new Date(now + 4 * 60 * 60_000 - 1000));
    expect(await isMuted("watchdog")).toBe(true);
    // Past 4h → mute auto-expires.
    _setClockForTests(() => new Date(now + 4 * 60 * 60_000 + 1000));
    expect(await isMuted("watchdog")).toBe(false);
  });

  it("setMute with a '30m' duration is honoured", async () => {
    const now = 1_700_000_000_000;
    _setClockForTests(() => new Date(now));
    await setMute("watchdog:deep_night", "30m");
    _setClockForTests(() => new Date(now + 29 * 60_000));
    expect(await isMuted("watchdog", "deep_night")).toBe(true);
    _setClockForTests(() => new Date(now + 31 * 60_000));
    expect(await isMuted("watchdog", "deep_night")).toBe(false);
  });

  it("setMute with null is a permanent mute (no expiry)", async () => {
    const now = 1_700_000_000_000;
    _setClockForTests(() => new Date(now));
    await setMute("watchdog", null);
    _setClockForTests(() => new Date(now + 365 * 24 * 60 * 60_000));
    expect(await isMuted("watchdog")).toBe(true);
  });

  it("isMuted matches `category:subcategory` exact mute", async () => {
    await setMute("watchdog:hyperfocus", null);
    expect(await isMuted("watchdog", "hyperfocus")).toBe(true);
    // The top-level category itself is NOT muted (only the specific
    // sub-category).
    expect(await isMuted("watchdog")).toBe(false);
    expect(await isMuted("watchdog", "deep_night")).toBe(false);
  });

  it("top-level category mute covers all sub-categories", async () => {
    await setMute("watchdog", null);
    expect(await isMuted("watchdog", "hyperfocus")).toBe(true);
    expect(await isMuted("watchdog", "deep_night")).toBe(true);
    expect(await isMuted("watchdog", "rumination_host")).toBe(true);
  });

  it("clearMute removes a category", async () => {
    await setMute("watchdog", null);
    await clearMute("watchdog");
    expect(await isMuted("watchdog")).toBe(false);
  });

  it("setMute with empty string clears an existing mute", async () => {
    await setMute("watchdog", null);
    expect(await isMuted("watchdog")).toBe(true);
    await setMute("watchdog", "");
    expect(await isMuted("watchdog")).toBe(false);
  });

  it("setMute replaces an existing mute on the same category", async () => {
    const now = 1_700_000_000_000;
    _setClockForTests(() => new Date(now));
    await setMute("watchdog", "1h");
    await setMute("watchdog", "4h");
    const mutes = await listMutes();
    // Only one entry for "watchdog", and the until reflects the 4h
    // replacement, not the 1h original.
    expect(mutes.filter((m) => m.category === "watchdog")).toHaveLength(1);
    const u = mutes.find((m) => m.category === "watchdog")?.until ?? "";
    const ms = Date.parse(u);
    expect(ms - now).toBeGreaterThan(3 * 60 * 60_000);
  });

  it("expired mutes are purged from storage opportunistically", async () => {
    const now = 1_700_000_000_000;
    _setClockForTests(() => new Date(now));
    await setMute("watchdog", "1m");
    expect((await listMutes()).length).toBe(1);
    _setClockForTests(() => new Date(now + 2 * 60_000));
    // The isMuted call should both return false and trigger a purge.
    expect(await isMuted("watchdog")).toBe(false);
    // Give the fire-and-forget write a microtask to land.
    await Promise.resolve();
    await Promise.resolve();
    expect((await listMutes()).length).toBe(0);
  });

  it("setMute with a number is interpreted as milliseconds from now", async () => {
    const now = 1_700_000_000_000;
    _setClockForTests(() => new Date(now));
    await setMute("watchdog", 5 * 60_000); // 5 minutes
    _setClockForTests(() => new Date(now + 4 * 60_000));
    expect(await isMuted("watchdog")).toBe(true);
    _setClockForTests(() => new Date(now + 6 * 60_000));
    expect(await isMuted("watchdog")).toBe(false);
  });
});
