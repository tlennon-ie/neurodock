/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Render the Notifications tab with seeded data and exercise the
 * primary user gestures: mark a row read, bulk delete, mute toggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  appendNotification,
  listMutes,
  listNotifications,
} from "../../src/lib/notifications.js";
import { NotificationsTab } from "../../entrypoints/popup/NotificationsTab.js";

async function clearStorage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome: { storage: { local: { clear: () => Promise<void> } } };
  };
  await g.chrome.storage.local.clear();
}

describe("NotificationsTab UI", () => {
  beforeEach(async () => {
    await clearStorage();
    // Stub window.confirm so the delete-all confirm() returns true.
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the empty state when there are no notifications", async () => {
    render(<NotificationsTab />);
    await waitFor(() =>
      expect(screen.getByTestId("notifications-empty")).toBeInTheDocument(),
    );
  });

  it("renders seeded notifications newest-first with unread count", async () => {
    await appendNotification({
      category: "watchdog",
      subcategory: "hyperfocus",
      title: "Hyperfocus check",
      body: "Take a break.",
    });
    await appendNotification({
      category: "guardrail",
      subcategory: "rumination",
      title: "Loop detected",
      body: "Step back.",
    });

    render(<NotificationsTab />);
    await waitFor(() =>
      expect(screen.getByTestId("notifications-list")).toBeInTheDocument(),
    );
    const rows = screen.getAllByTestId("notifications-row");
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toContain("Loop detected");
    expect(rows[1]!.textContent).toContain("Hyperfocus check");
    expect(
      screen.getByTestId("notifications-unread-count").textContent,
    ).toContain("2");
  });

  it("marks a row read via the per-row toggle button", async () => {
    await appendNotification({
      category: "watchdog",
      subcategory: "hyperfocus",
      title: "Hyperfocus",
      body: "",
    });
    render(<NotificationsTab />);
    await waitFor(() =>
      expect(screen.getByTestId("notifications-list")).toBeInTheDocument(),
    );
    const toggle = screen.getByTestId("notifications-row-toggle-read");
    fireEvent.click(toggle);
    await waitFor(() => {
      const row = screen.getByTestId("notifications-row");
      expect(row.getAttribute("data-unread")).toBe("false");
    });
    // Unread badge should disappear when there are zero unread.
    expect(screen.queryByTestId("notifications-unread-count")).toBeNull();
  });

  it("deletes all notifications via the bulk button", async () => {
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

    render(<NotificationsTab />);
    await waitFor(() =>
      expect(screen.getByTestId("notifications-list")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("notifications-delete-all"));

    await waitFor(() =>
      expect(screen.getByTestId("notifications-empty")).toBeInTheDocument(),
    );
    expect(await listNotifications()).toEqual([]);
  });

  it("marks all rows read via the bulk button", async () => {
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

    render(<NotificationsTab />);
    await waitFor(() =>
      expect(screen.getByTestId("notifications-list")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("notifications-mark-all-read"));
    await waitFor(() => {
      const rows = screen.getAllByTestId("notifications-row");
      for (const r of rows) {
        expect(r.getAttribute("data-unread")).toBe("false");
      }
    });
  });

  it("toggles a mute via the mute control row", async () => {
    render(<NotificationsTab />);
    // Wait for the mute control row to mount (renders even when empty).
    await waitFor(() =>
      expect(
        screen.getByTestId("mute-row-watchdog:hyperfocus"),
      ).toBeInTheDocument(),
    );
    // Click the 4h mute for hyperfocus.
    fireEvent.click(screen.getByTestId("mute-watchdog:hyperfocus-4h"));
    await waitFor(() =>
      expect(
        screen.getByTestId("mute-clear-watchdog:hyperfocus"),
      ).toBeInTheDocument(),
    );
    expect(
      (await listMutes()).some((m) => m.category === "watchdog:hyperfocus"),
    ).toBe(true);
    // Clicking Unmute clears the mute.
    fireEvent.click(screen.getByTestId("mute-clear-watchdog:hyperfocus"));
    await waitFor(() =>
      expect(
        screen.getByTestId("mute-watchdog:hyperfocus-4h"),
      ).toBeInTheDocument(),
    );
    expect(
      (await listMutes()).some((m) => m.category === "watchdog:hyperfocus"),
    ).toBe(false);
  });

  it("deletes a single notification via the per-row delete", async () => {
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "to-delete",
      body: "",
    });
    await appendNotification({
      category: "system",
      subcategory: "info",
      title: "to-keep",
      body: "",
    });
    render(<NotificationsTab />);
    await waitFor(() =>
      expect(screen.getByTestId("notifications-list")).toBeInTheDocument(),
    );
    const deletes = screen.getAllByTestId("notifications-row-delete");
    // Newest-first ordering: "to-keep" appears first, so its delete is
    // the first one. Click the second one to delete "to-delete".
    fireEvent.click(deletes[1]!);
    await waitFor(() => {
      const rows = screen.getAllByTestId("notifications-row");
      expect(rows.length).toBe(1);
      expect(rows[0]!.textContent).toContain("to-keep");
    });
  });
});
