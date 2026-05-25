/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Unit test for RFC A3 keyboard navigation across the popup tab bar.
 *
 * WAI-ARIA tab pattern: ArrowRight / ArrowDown move forward, ArrowLeft
 * / ArrowUp move backward (with wraparound), Home jumps to the first
 * tab, End jumps to the last.
 */
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App } from "../../entrypoints/popup/App.js";

async function seedOnboardedProfile(): Promise<void> {
  // RFC A1 added a first-run onboarding wizard that replaces the TabBar
  // when profile.onboardingComplete !== true. Seed an "already onboarded"
  // profile so the TabBar renders for the keyboard-nav assertions below.
  const c = (
    globalThis as unknown as {
      chrome: {
        storage: {
          local: {
            clear: () => Promise<void>;
            set: (items: Record<string, unknown>) => Promise<void>;
          };
        };
      };
    }
  ).chrome;
  await c.storage.local.clear();
  await c.storage.local.set({
    "neurodock.profile.v1": { onboardingComplete: true },
  });
}

describe("Popup tab bar — arrow-key navigation (RFC A3)", () => {
  beforeEach(async () => {
    await seedOnboardedProfile();
    document.documentElement.className = "";
  });

  it("cycles forward through tabs on ArrowRight", async () => {
    render(<App />);
    const homeTab = await screen.findByTestId("tab-home");
    await waitFor(() =>
      expect(homeTab.getAttribute("aria-selected")).toBe("true"),
    );
    const tabList = screen.getByTestId("popup-tab-list");
    fireEvent.keyDown(tabList, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        screen.getByTestId("tab-notifications").getAttribute("aria-selected"),
      ).toBe("true"),
    );
    fireEvent.keyDown(tabList, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        screen.getByTestId("tab-settings").getAttribute("aria-selected"),
      ).toBe("true"),
    );
    // Wraparound — settings → home.
    fireEvent.keyDown(tabList, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByTestId("tab-home").getAttribute("aria-selected")).toBe(
        "true",
      ),
    );
  });

  it("cycles backward through tabs on ArrowLeft (with wraparound)", async () => {
    render(<App />);
    await screen.findByTestId("tab-home");
    const tabList = screen.getByTestId("popup-tab-list");
    fireEvent.keyDown(tabList, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(
        screen.getByTestId("tab-settings").getAttribute("aria-selected"),
      ).toBe("true"),
    );
  });

  it("jumps to first / last with Home / End", async () => {
    render(<App />);
    await screen.findByTestId("tab-home");
    const tabList = screen.getByTestId("popup-tab-list");
    fireEvent.keyDown(tabList, { key: "End" });
    await waitFor(() =>
      expect(
        screen.getByTestId("tab-settings").getAttribute("aria-selected"),
      ).toBe("true"),
    );
    fireEvent.keyDown(tabList, { key: "Home" });
    await waitFor(() =>
      expect(screen.getByTestId("tab-home").getAttribute("aria-selected")).toBe(
        "true",
      ),
    );
  });

  it("does not preventDefault for unrelated keys", async () => {
    render(<App />);
    await screen.findByTestId("tab-home");
    const tabList = screen.getByTestId("popup-tab-list");
    // The handler should not capture random alphanumeric keys.
    const event = fireEvent.keyDown(tabList, { key: "a" });
    expect(event).toBe(true);
  });

  it("sets tabIndex=0 on the active tab and -1 on the others", async () => {
    render(<App />);
    const homeTab = await screen.findByTestId("tab-home");
    await waitFor(() =>
      expect(homeTab.getAttribute("aria-selected")).toBe("true"),
    );
    expect(homeTab.getAttribute("tabindex")).toBe("0");
    expect(
      screen.getByTestId("tab-notifications").getAttribute("tabindex"),
    ).toBe("-1");
    expect(screen.getByTestId("tab-settings").getAttribute("tabindex")).toBe(
      "-1",
    );
  });
});
