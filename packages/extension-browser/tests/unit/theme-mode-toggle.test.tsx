/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Unit tests for src/components/ThemeModeToggle.tsx (theme v2).
 *
 * Covers:
 *   - default render mounts in "system" mode with no class on <html>
 *   - click cycles system → light → dark → system
 *   - each cycle updates the class on <html> on the same render tick
 *     (the click handler does NOT wait for the chrome.storage write)
 *   - the persisted choice is read back on remount
 *   - aria-label reflects the CURRENT mode (not the next one)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import React from "react";
import { ThemeModeToggle } from "../../src/components/ThemeModeToggle.js";
import { THEME_MODE_STORAGE_KEY } from "../../src/lib/theme-mode.js";

async function clearChromeStorage(): Promise<void> {
  const c = (
    globalThis as unknown as {
      chrome: { storage: { local: { clear: () => Promise<void> } } };
    }
  ).chrome;
  await c.storage.local.clear();
}

async function readStoredMode(): Promise<unknown> {
  const c = (
    globalThis as unknown as {
      chrome: {
        storage: {
          local: {
            get: (k: string) => Promise<Record<string, unknown>>;
          };
        };
      };
    }
  ).chrome;
  const got = await c.storage.local.get(THEME_MODE_STORAGE_KEY);
  return got[THEME_MODE_STORAGE_KEY];
}

describe("ThemeModeToggle", () => {
  beforeEach(async () => {
    await clearChromeStorage();
    document.documentElement.className = "";
    cleanup();
  });

  it("renders the toggle with mode=system and no theme class on <html>", async () => {
    render(<ThemeModeToggle />);
    const btn = await screen.findByTestId("theme-mode-toggle");
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn.getAttribute("data-theme-mode")).toBe("system");
    expect(btn.getAttribute("aria-label")).toBe("Theme: system");
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      false,
    );
  });

  it("first click sets mode=light and adds nd-theme-light to <html>", async () => {
    render(<ThemeModeToggle />);
    const btn = (await screen.findByTestId(
      "theme-mode-toggle",
    )) as HTMLButtonElement;
    await waitFor(() => expect(btn).not.toBeDisabled());
    await act(async () => {
      btn.click();
    });
    expect(btn.getAttribute("data-theme-mode")).toBe("light");
    expect(btn.getAttribute("aria-label")).toBe("Theme: light");
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      true,
    );
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      false,
    );
  });

  it("second click moves to dark; third click returns to system", async () => {
    render(<ThemeModeToggle />);
    const btn = (await screen.findByTestId(
      "theme-mode-toggle",
    )) as HTMLButtonElement;
    await waitFor(() => expect(btn).not.toBeDisabled());

    await act(async () => {
      btn.click(); // → light
    });
    await act(async () => {
      btn.click(); // → dark
    });
    expect(btn.getAttribute("data-theme-mode")).toBe("dark");
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      true,
    );
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      false,
    );

    await act(async () => {
      btn.click(); // → system
    });
    expect(btn.getAttribute("data-theme-mode")).toBe("system");
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      false,
    );
  });

  it("persists the choice to chrome.storage.local", async () => {
    render(<ThemeModeToggle />);
    const btn = (await screen.findByTestId(
      "theme-mode-toggle",
    )) as HTMLButtonElement;
    await waitFor(() => expect(btn).not.toBeDisabled());
    await act(async () => {
      btn.click(); // → light
    });
    await waitFor(async () => {
      expect(await readStoredMode()).toBe("light");
    });
  });

  it("rehydrates from a pre-existing stored value on remount", async () => {
    const c = (
      globalThis as unknown as {
        chrome: {
          storage: {
            local: { set: (i: Record<string, unknown>) => Promise<void> };
          };
        };
      }
    ).chrome;
    await c.storage.local.set({ [THEME_MODE_STORAGE_KEY]: "dark" });

    render(<ThemeModeToggle />);
    const btn = (await screen.findByTestId(
      "theme-mode-toggle",
    )) as HTMLButtonElement;
    await waitFor(() =>
      expect(btn.getAttribute("data-theme-mode")).toBe("dark"),
    );
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      true,
    );
  });

  it("aria-label always describes the CURRENT mode (not next)", async () => {
    render(<ThemeModeToggle />);
    const btn = (await screen.findByTestId(
      "theme-mode-toggle",
    )) as HTMLButtonElement;
    await waitFor(() => expect(btn).not.toBeDisabled());

    expect(btn.getAttribute("aria-label")).toBe("Theme: system");
    await act(async () => {
      btn.click(); // → light
    });
    expect(btn.getAttribute("aria-label")).toBe("Theme: light");
    await act(async () => {
      btn.click(); // → dark
    });
    expect(btn.getAttribute("aria-label")).toBe("Theme: dark");
  });
});
