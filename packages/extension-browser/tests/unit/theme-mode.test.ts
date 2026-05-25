/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Unit tests for src/lib/theme-mode.ts (theme v2 user override).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_THEME_MODE,
  THEME_MODE_STORAGE_KEY,
  applyThemeModeToDocument,
  loadThemeMode,
  resolveEffectiveTheme,
  saveThemeMode,
} from "../../src/lib/theme-mode.js";

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
  const got = await c.storage.local.get(THEME_MODE_STORAGE_KEY);
  return got[THEME_MODE_STORAGE_KEY];
}

describe("theme-mode — storage", () => {
  beforeEach(async () => {
    await clearChromeStorage();
    document.documentElement.className = "";
  });

  it("defaults to system when no key is present", async () => {
    expect(await loadThemeMode()).toBe(DEFAULT_THEME_MODE);
    expect(DEFAULT_THEME_MODE).toBe("system");
  });

  it("does NOT write on an empty load", async () => {
    await loadThemeMode();
    expect(await rawStoredValue()).toBeUndefined();
  });

  it("round-trips a save of 'dark'", async () => {
    await saveThemeMode("dark");
    expect(await loadThemeMode()).toBe("dark");
  });

  it("round-trips a save of 'light'", async () => {
    await saveThemeMode("light");
    expect(await loadThemeMode()).toBe("light");
  });

  it("normalises garbage to the default", async () => {
    const c = (
      globalThis as unknown as {
        chrome: {
          storage: {
            local: { set: (i: Record<string, unknown>) => Promise<void> };
          };
        };
      }
    ).chrome;
    await c.storage.local.set({ [THEME_MODE_STORAGE_KEY]: "rainbow" });
    expect(await loadThemeMode()).toBe(DEFAULT_THEME_MODE);
  });

  it("normalises non-string garbage to the default", async () => {
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
      [THEME_MODE_STORAGE_KEY]: { nested: "dark" },
    });
    expect(await loadThemeMode()).toBe(DEFAULT_THEME_MODE);
  });
});

describe("theme-mode — applyThemeModeToDocument", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("adds nd-theme-light when mode is light", () => {
    applyThemeModeToDocument("light", document);
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      true,
    );
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      false,
    );
  });

  it("adds nd-theme-dark when mode is dark", () => {
    applyThemeModeToDocument("dark", document);
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      true,
    );
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      false,
    );
  });

  it("removes both classes when mode is system", () => {
    document.documentElement.classList.add("nd-theme-dark");
    applyThemeModeToDocument("system", document);
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      false,
    );
  });

  it("flipping light → dark drops the stale light class", () => {
    applyThemeModeToDocument("light", document);
    applyThemeModeToDocument("dark", document);
    expect(document.documentElement.classList.contains("nd-theme-light")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      true,
    );
  });

  it("flipping dark → system removes both classes", () => {
    applyThemeModeToDocument("dark", document);
    applyThemeModeToDocument("system", document);
    expect(document.documentElement.classList.contains("nd-theme-dark")).toBe(
      false,
    );
  });

  it("is idempotent", () => {
    applyThemeModeToDocument("dark", document);
    const first = Array.from(document.documentElement.classList).sort();
    applyThemeModeToDocument("dark", document);
    const second = Array.from(document.documentElement.classList).sort();
    expect(second).toEqual(first);
  });

  it("applies to a ShadowRoot's host element", () => {
    const hostEl = document.createElement("div");
    document.body.appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: "open" });
    applyThemeModeToDocument("dark", shadow);
    expect(hostEl.classList.contains("nd-theme-dark")).toBe(true);
    hostEl.remove();
  });
});

describe("theme-mode — resolveEffectiveTheme", () => {
  it("returns 'light' verbatim when mode is light", () => {
    expect(resolveEffectiveTheme("light")).toBe("light");
  });

  it("returns 'dark' verbatim when mode is dark", () => {
    expect(resolveEffectiveTheme("dark")).toBe("dark");
  });

  it("returns 'dark' under system when matchMedia reports dark", () => {
    const fakeWin = {
      matchMedia: (_q: string) => ({ matches: true }) as MediaQueryList,
    };
    expect(
      resolveEffectiveTheme("system", fakeWin as unknown as typeof globalThis),
    ).toBe("dark");
  });

  it("returns 'light' under system when matchMedia reports light", () => {
    const fakeWin = {
      matchMedia: (_q: string) => ({ matches: false }) as MediaQueryList,
    };
    expect(
      resolveEffectiveTheme("system", fakeWin as unknown as typeof globalThis),
    ).toBe("light");
  });

  it("returns 'light' fallback when matchMedia is unavailable", () => {
    expect(
      resolveEffectiveTheme(
        "system",
        undefined as unknown as typeof globalThis,
      ),
    ).toBe("light");
  });
});
