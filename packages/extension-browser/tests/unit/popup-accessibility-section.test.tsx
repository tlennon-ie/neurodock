/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Unit tests for entrypoints/popup/AccessibilitySection.tsx (RFC A3).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";
import { AccessibilitySection } from "../../entrypoints/popup/AccessibilitySection.js";
import { A11Y_STORAGE_KEY } from "../../src/lib/accessibility.js";

async function clearChromeStorage(): Promise<void> {
  const c = (
    globalThis as unknown as {
      chrome: { storage: { local: { clear: () => Promise<void> } } };
    }
  ).chrome;
  await c.storage.local.clear();
}

async function readStored(): Promise<unknown> {
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
  const got = await c.storage.local.get(A11Y_STORAGE_KEY);
  return got[A11Y_STORAGE_KEY];
}

describe("AccessibilitySection", () => {
  beforeEach(async () => {
    await clearChromeStorage();
    document.documentElement.className = "";
  });

  it("renders the heading and both toggles in sentence case", async () => {
    render(<AccessibilitySection />);
    expect(
      screen.getByRole("group", { name: /Accessibility/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("High-contrast theme")).toBeInTheDocument();
    expect(screen.getByText("Focus mode")).toBeInTheDocument();
  });

  it("renders the keyboard map block at the bottom", async () => {
    render(<AccessibilitySection />);
    const block = screen.getByTestId("a11y-keyboard-map");
    expect(block).toBeInTheDocument();
    expect(block).toHaveTextContent(/Tab/);
    expect(block).toHaveTextContent(/Enter/);
    expect(block).toHaveTextContent(/Esc/);
    expect(block).toHaveTextContent(/Arrow keys/);
  });

  it("starts with both toggles unchecked when storage is empty", async () => {
    render(<AccessibilitySection />);
    await waitFor(() => {
      const hc = screen.getByTestId(
        "a11y-high-contrast-toggle",
      ) as HTMLInputElement;
      expect(hc.disabled).toBe(false);
    });
    const hc = screen.getByTestId(
      "a11y-high-contrast-toggle",
    ) as HTMLInputElement;
    const fm = screen.getByTestId("a11y-focus-mode-toggle") as HTMLInputElement;
    expect(hc.checked).toBe(false);
    expect(fm.checked).toBe(false);
  });

  it("persists highContrast to chrome.storage.local when toggled", async () => {
    render(<AccessibilitySection />);
    const hc = (await screen.findByTestId(
      "a11y-high-contrast-toggle",
    )) as HTMLInputElement;
    await waitFor(() => expect(hc.disabled).toBe(false));
    await act(async () => {
      hc.click();
    });
    await waitFor(async () => {
      const stored = (await readStored()) as
        | Record<string, unknown>
        | undefined;
      expect(stored).toBeDefined();
      expect(stored?.highContrast).toBe(true);
      expect(stored?.focusMode).toBe(false);
      expect(stored?.schemaVersion).toBe(1);
    });
    expect(
      document.documentElement.classList.contains("nd-high-contrast"),
    ).toBe(true);
  });

  it("persists focusMode independently", async () => {
    render(<AccessibilitySection />);
    const fm = (await screen.findByTestId(
      "a11y-focus-mode-toggle",
    )) as HTMLInputElement;
    await waitFor(() => expect(fm.disabled).toBe(false));
    await act(async () => {
      fm.click();
    });
    await waitFor(async () => {
      const stored = (await readStored()) as
        | Record<string, unknown>
        | undefined;
      expect(stored?.focusMode).toBe(true);
      expect(stored?.highContrast).toBe(false);
    });
    expect(document.documentElement.classList.contains("nd-focus-mode")).toBe(
      true,
    );
  });

  it("rehydrates the toggles from a pre-existing stored value", async () => {
    const c = (
      globalThis as unknown as {
        chrome: {
          storage: {
            local: { set: (i: Record<string, unknown>) => Promise<void> };
          };
        };
      }
    ).chrome;
    await c.storage.local.set({
      [A11Y_STORAGE_KEY]: {
        highContrast: true,
        focusMode: true,
        schemaVersion: 1,
      },
    });
    render(<AccessibilitySection />);
    await waitFor(() => {
      const hc = screen.getByTestId(
        "a11y-high-contrast-toggle",
      ) as HTMLInputElement;
      const fm = screen.getByTestId(
        "a11y-focus-mode-toggle",
      ) as HTMLInputElement;
      expect(hc.checked).toBe(true);
      expect(fm.checked).toBe(true);
    });
  });
});
