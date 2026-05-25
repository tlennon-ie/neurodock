/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Pacing nudges must flow through the in-extension notifications inbox
 * (via `appendNotification`) so users can audit them later, mute the
 * category, and don't lose them if the in-page toast is dismissed.
 *
 * This test wires the same helper the background.ts watchdog tick uses
 * — append a pacing nudge as a `watchdog` category notification with
 * subcategory `pacing_<kind>` — and asserts the row lands.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  appendNotification,
  listNotifications,
} from "../../src/lib/notifications.js";
import { renderNudgeText } from "../../src/lib/pacing.js";

async function clearStorage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome: { storage: { local: { clear: () => Promise<void> } } };
  };
  await g.chrome.storage.local.clear();
}

describe("pacing → notifications inbox", () => {
  beforeEach(async () => {
    await clearStorage();
  });

  it("appends a break nudge with category=watchdog subcategory=pacing_break", async () => {
    const text = renderNudgeText("break", 47);
    await appendNotification({
      category: "watchdog",
      subcategory: "pacing_break",
      title: text.title,
      body: text.body,
      meta: { kind: "break", minutesIn: 47 },
    });
    const list = await listNotifications();
    expect(list).toHaveLength(1);
    const row = list[0]!;
    expect(row.category).toBe("watchdog");
    expect(row.subcategory).toBe("pacing_break");
    expect(row.title).toBe("Pacing check");
    expect(row.body).toContain("47 minutes");
    expect(row.meta).toEqual({ kind: "break", minutesIn: 47 });
  });

  it("appends a long_session nudge with subcategory=pacing_long_session", async () => {
    const text = renderNudgeText("long_session", 92);
    await appendNotification({
      category: "watchdog",
      subcategory: "pacing_long_session",
      title: text.title,
      body: text.body,
      meta: { kind: "long_session", minutesIn: 92 },
    });
    const list = await listNotifications();
    expect(list[0]?.subcategory).toBe("pacing_long_session");
  });

  it("appends a timebox nudge with subcategory=pacing_timebox", async () => {
    const text = renderNudgeText("timebox", 0);
    await appendNotification({
      category: "watchdog",
      subcategory: "pacing_timebox",
      title: text.title,
      body: text.body,
    });
    const list = await listNotifications();
    expect(list[0]?.subcategory).toBe("pacing_timebox");
  });
});
