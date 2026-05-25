/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Notifications inbox — append/list/markRead/delete/LRU eviction.
 *
 * The setup.ts shim provides an in-memory `chrome.storage.local`. We
 * clear it between tests via the same `clear()` helper the profile
 * tests use, then exercise the public surface end-to-end.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  appendNotification,
  listNotifications,
  markRead,
  markUnread,
  markAllRead,
  deleteNotification,
  deleteAll,
  MAX_STORED_NOTIFICATIONS,
  _setClockForTests,
  _resetClockForTests,
} from "../../src/lib/notifications.js";

async function clearStorage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome: { storage: { local: { clear: () => Promise<void> } } };
  };
  await g.chrome.storage.local.clear();
}

describe("notifications inbox storage", () => {
  beforeEach(async () => {
    await clearStorage();
    _resetClockForTests();
  });

  it("appendNotification persists a record retrievable by listNotifications", async () => {
    const stored = await appendNotification({
      category: "watchdog",
      subcategory: "hyperfocus",
      title: "Hyperfocus check",
      body: "12 translations in 30 min — take a break.",
      meta: { count: 12 },
    });
    expect(stored.id).toBeDefined();
    expect(stored.readAt).toBeNull();
    expect(stored.meta).toEqual({ count: 12 });
    const list = await listNotifications();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Hyperfocus check");
  });

  it("listNotifications returns newest first", async () => {
    let t = 1_700_000_000_000;
    _setClockForTests(() => new Date(t));
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "first",
      body: "older",
    });
    t += 60_000;
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "second",
      body: "newer",
    });
    const list = await listNotifications();
    expect(list.map((n) => n.title)).toEqual(["second", "first"]);
  });

  it("listNotifications honours the limit argument", async () => {
    for (let i = 0; i < 5; i++) {
      // Advance clock so ordering is stable.
      _setClockForTests(() => new Date(1_700_000_000_000 + i * 1000));
      await appendNotification({
        category: "system",
        subcategory: "info",
        title: `n-${i}`,
        body: "",
      });
    }
    const top2 = await listNotifications(2);
    expect(top2).toHaveLength(2);
    expect(top2.map((n) => n.title)).toEqual(["n-4", "n-3"]);
  });

  it("markRead stamps readAt and is idempotent", async () => {
    const stored = await appendNotification({
      category: "guardrail",
      subcategory: "rumination",
      title: "Loop detected",
      body: "",
    });
    await markRead(stored.id);
    const first = await listNotifications();
    expect(first[0]!.readAt).not.toBeNull();
    const stamped = first[0]!.readAt;
    // Re-running markRead must not change the timestamp.
    await markRead(stored.id);
    const second = await listNotifications();
    expect(second[0]!.readAt).toBe(stamped);
  });

  it("markUnread clears readAt", async () => {
    const stored = await appendNotification({
      category: "guardrail",
      subcategory: "rumination",
      title: "Loop detected",
      body: "",
    });
    await markRead(stored.id);
    await markUnread(stored.id);
    const list = await listNotifications();
    expect(list[0]!.readAt).toBeNull();
  });

  it("markAllRead stamps every unread record", async () => {
    await appendNotification({
      category: "watchdog",
      subcategory: "hyperfocus",
      title: "a",
      body: "",
    });
    await appendNotification({
      category: "watchdog",
      subcategory: "deep_night",
      title: "b",
      body: "",
    });
    await markAllRead();
    const list = await listNotifications();
    expect(list.every((n) => n.readAt !== null)).toBe(true);
  });

  it("deleteNotification removes one item by id", async () => {
    const a = await appendNotification({
      category: "system",
      subcategory: "info",
      title: "a",
      body: "",
    });
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "b",
      body: "",
    });
    await deleteNotification(a.id);
    const list = await listNotifications();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("b");
  });

  it("deleteAll empties the inbox", async () => {
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "a",
      body: "",
    });
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "b",
      body: "",
    });
    await deleteAll();
    const list = await listNotifications();
    expect(list).toEqual([]);
  });

  it("evicts the oldest entries past MAX_STORED_NOTIFICATIONS (LRU tail drop)", async () => {
    // Append cap + 5 records. The 5 oldest should be evicted.
    const total = MAX_STORED_NOTIFICATIONS + 5;
    for (let i = 0; i < total; i++) {
      _setClockForTests(() => new Date(1_700_000_000_000 + i * 1000));
      await appendNotification({
        category: "system",
        subcategory: "info",
        title: `n-${i}`,
        body: "",
      });
    }
    const list = await listNotifications(MAX_STORED_NOTIFICATIONS + 10);
    expect(list).toHaveLength(MAX_STORED_NOTIFICATIONS);
    // Newest title preserved, oldest evicted.
    expect(list[0]!.title).toBe(`n-${total - 1}`);
    expect(list.find((n) => n.title === "n-0")).toBeUndefined();
  });

  it("preserves immutability — appending does not mutate prior records", async () => {
    const first = await appendNotification({
      category: "system",
      subcategory: "info",
      title: "first",
      body: "",
    });
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "second",
      body: "",
    });
    // The originally-returned object should not have been mutated by the
    // second append (it should still report readAt: null).
    expect(first.readAt).toBeNull();
  });
});
