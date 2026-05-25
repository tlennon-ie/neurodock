/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Unit tests for src/lib/accessibility.ts (RFC A3).
 *
 * Coverage targets:
 *   - load/save round-trip
 *   - default fallback when nothing is stored
 *   - migration of an empty storage value (no destructive overwrite)
 *   - normalisation of arbitrary stored garbage
 *   - idempotent applyA11yToDocument on Document and on ShadowRoot
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFERENCES,
  applyA11yToDocument,
  loadA11yPreferences,
  saveA11yPreferences,
} from "../../src/lib/accessibility.js";

async function clearChromeStorage(): Promise<void> {
  const c = (
    globalThis as unknown as {
      chrome: { storage: { local: { clear: () => Promise<void> } } };
    }
  ).chrome;
  await c.storage.local.clear();
}

async function rawStoredValue(): Promise<unknown> {
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

describe("accessibility — storage", () => {
  beforeEach(async () => {
    await clearChromeStorage();
    document.documentElement.className = "";
  });

  it("returns the defaults when no key is present", async () => {
    const prefs = await loadA11yPreferences();
    expect(prefs).toEqual(DEFAULT_A11Y_PREFERENCES);
    expect(prefs.highContrast).toBe(false);
    expect(prefs.focusMode).toBe(false);
    expect(prefs.schemaVersion).toBe(1);
  });

  it("does NOT write to storage on an empty load (no destructive overwrite)", async () => {
    await loadA11yPreferences();
    expect(await rawStoredValue()).toBeUndefined();
  });

  it("round-trips a save", async () => {
    await saveA11yPreferences({
      highContrast: true,
      focusMode: true,
      schemaVersion: 1,
    });
    const prefs = await loadA11yPreferences();
    expect(prefs.highContrast).toBe(true);
    expect(prefs.focusMode).toBe(true);
    expect(prefs.schemaVersion).toBe(1);
  });

  it("round-trips a partial change (only focusMode flipped)", async () => {
    await saveA11yPreferences({
      highContrast: false,
      focusMode: true,
      schemaVersion: 1,
    });
    const prefs = await loadA11yPreferences();
    expect(prefs.highContrast).toBe(false);
    expect(prefs.focusMode).toBe(true);
  });

  it("normalises arbitrary garbage in storage to the defaults", async () => {
    const c = (
      globalThis as unknown as {
        chrome: {
          storage: {
            local: { set: (i: Record<string, unknown>) => Promise<void> };
          };
        };
      }
    ).chrome;
    await c.storage.local.set({ [A11Y_STORAGE_KEY]: "not an object" });
    const prefs = await loadA11yPreferences();
    expect(prefs).toEqual(DEFAULT_A11Y_PREFERENCES);
  });

  it("drops unknown fields and coerces non-boolean booleans", async () => {
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
        highContrast: "yes please",
        focusMode: 1,
        rogueField: { nested: true },
      },
    });
    const prefs = await loadA11yPreferences();
    // Only strict `=== true` counts; anything else collapses to false.
    expect(prefs.highContrast).toBe(false);
    expect(prefs.focusMode).toBe(false);
    expect(prefs.schemaVersion).toBe(1);
    expect((prefs as unknown as Record<string, unknown>).rogueField).toBe(
      undefined,
    );
  });
});

describe("accessibility — applyA11yToDocument", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("adds both classes when both prefs are on", () => {
    applyA11yToDocument(
      { highContrast: true, focusMode: true, schemaVersion: 1 },
      document,
    );
    expect(
      document.documentElement.classList.contains("nd-high-contrast"),
    ).toBe(true);
    expect(document.documentElement.classList.contains("nd-focus-mode")).toBe(
      true,
    );
  });

  it("removes both classes when both prefs are off", () => {
    document.documentElement.classList.add("nd-high-contrast", "nd-focus-mode");
    applyA11yToDocument(
      { highContrast: false, focusMode: false, schemaVersion: 1 },
      document,
    );
    expect(
      document.documentElement.classList.contains("nd-high-contrast"),
    ).toBe(false);
    expect(document.documentElement.classList.contains("nd-focus-mode")).toBe(
      false,
    );
  });

  it("is idempotent — calling twice yields the same classList", () => {
    const prefs = {
      highContrast: true,
      focusMode: false,
      schemaVersion: 1,
    } as const;
    applyA11yToDocument(prefs, document);
    const first = Array.from(document.documentElement.classList).sort();
    applyA11yToDocument(prefs, document);
    const second = Array.from(document.documentElement.classList).sort();
    expect(second).toEqual(first);
    expect(first.includes("nd-high-contrast")).toBe(true);
    expect(first.includes("nd-focus-mode")).toBe(false);
  });

  it("applies to a ShadowRoot's host element, not the shadow itself", () => {
    const hostEl = document.createElement("div");
    hostEl.setAttribute("data-test-shadow-host", "true");
    document.body.appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: "open" });
    applyA11yToDocument(
      { highContrast: true, focusMode: true, schemaVersion: 1 },
      shadow,
    );
    expect(hostEl.classList.contains("nd-high-contrast")).toBe(true);
    expect(hostEl.classList.contains("nd-focus-mode")).toBe(true);
    hostEl.remove();
  });

  it("flipping a single preference does not leave a stale class", () => {
    applyA11yToDocument(
      { highContrast: true, focusMode: true, schemaVersion: 1 },
      document,
    );
    applyA11yToDocument(
      { highContrast: false, focusMode: true, schemaVersion: 1 },
      document,
    );
    expect(
      document.documentElement.classList.contains("nd-high-contrast"),
    ).toBe(false);
    expect(document.documentElement.classList.contains("nd-focus-mode")).toBe(
      true,
    );
  });
});
