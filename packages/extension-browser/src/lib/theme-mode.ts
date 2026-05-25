/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * User-controlled theme override (theme v2).
 *
 * Three modes:
 *   - "system" — follow `prefers-color-scheme` (default).
 *   - "light"  — force the calm light palette regardless of OS.
 *   - "dark"   — force the dim dark palette regardless of OS.
 *
 * Persisted under `neurodock.themeMode.v1` in `chrome.storage.local`
 * (never `sync` — display preference is per-device). Kept OUTSIDE the
 * larger `ExtensionProfile` blob so the same early-paint pattern that
 * `accessibility.ts` uses works here: read + apply happens before the
 * heavier profile load resolves, eliminating a paint with the wrong
 * palette on popup open.
 *
 * Application is idempotent — `applyThemeModeToDocument` toggles the
 * two CSS classes (`nd-theme-light`, `nd-theme-dark`) on the target
 * `<html>` (or shadow-root host). The CSS variants live in
 * `src/styles/tokens.css` (popup + tab) and the inline stylesheet in
 * `entrypoints/_shared/mountIsland.ts` (content-script islands), so
 * every surface flips in lockstep.
 *
 * The class list is intentionally narrow: applying `nd-theme-dark`
 * REMOVES `nd-theme-light` (and vice versa). Setting mode to
 * `"system"` removes both classes so the media query resumes control.
 */

const STORAGE_KEY = "neurodock.themeMode.v1";

const LIGHT_CLASS = "nd-theme-light";
const DARK_CLASS = "nd-theme-dark";

export const THEME_MODE_STORAGE_KEY = STORAGE_KEY;

export type ThemeMode = "system" | "light" | "dark";

export const DEFAULT_THEME_MODE: ThemeMode = "system";

interface StorageLike {
  readonly get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
}

function fallbackStorage(): StorageLike {
  const memory = new Map<string, unknown>();
  return {
    async get(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) {
        if (memory.has(k)) out[k] = memory.get(k);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) memory.set(k, v);
    },
  };
}

function getStorage(): StorageLike {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageLike } };
  };
  if (g.chrome?.storage?.local) {
    return g.chrome.storage.local;
  }
  return fallbackStorage();
}

function normalise(input: unknown): ThemeMode {
  if (input === "light" || input === "dark" || input === "system") {
    return input;
  }
  return DEFAULT_THEME_MODE;
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const storage = getStorage();
  try {
    const result = await storage.get(STORAGE_KEY);
    return normalise(result[STORAGE_KEY]);
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  const storage = getStorage();
  await storage.set({ [STORAGE_KEY]: normalise(mode) });
}

/**
 * Idempotent. Toggles the two class names on the supplied root.
 *
 * Accepts both `Document` (popup + tab) and `ShadowRoot` (per-site
 * content-script island). For Document, the class lands on
 * `documentElement`. For ShadowRoot, on the `host` element so
 * `:host(.nd-theme-…)` resolves inside the shadow tree.
 */
export function applyThemeModeToDocument(
  mode: ThemeMode,
  root: Document | ShadowRoot,
): void {
  const target = resolveClassTarget(root);
  if (target === null) return;
  const wantLight = mode === "light";
  const wantDark = mode === "dark";
  toggleClass(target, LIGHT_CLASS, wantLight);
  toggleClass(target, DARK_CLASS, wantDark);
}

function resolveClassTarget(root: Document | ShadowRoot): Element | null {
  if (isDocument(root)) {
    return root.documentElement;
  }
  const shadow = root as ShadowRoot;
  if (shadow.host instanceof Element) {
    return shadow.host;
  }
  return null;
}

function isDocument(root: Document | ShadowRoot): root is Document {
  return typeof (root as Document).documentElement !== "undefined";
}

function toggleClass(target: Element, name: string, on: boolean): void {
  if (on) {
    if (!target.classList.contains(name)) {
      target.classList.add(name);
    }
    return;
  }
  if (target.classList.contains(name)) {
    target.classList.remove(name);
  }
}

/**
 * Resolve the *effective* palette currently in use. Useful for tests
 * and the popup's "currently using dark" affordance when mode is
 * `system` and we need to render the right icon.
 *
 * Reads `matchMedia("(prefers-color-scheme: dark)")` when the mode is
 * `system`. When `matchMedia` is unavailable (older Node JSDOM, edge
 * cases), defaults to `"light"`.
 */
export function resolveEffectiveTheme(
  mode: ThemeMode,
  win: Pick<typeof globalThis, "matchMedia"> | undefined = typeof window !==
  "undefined"
    ? window
    : undefined,
): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  const mm = win?.matchMedia;
  if (typeof mm === "function") {
    try {
      return mm.call(win, "(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  }
  return "light";
}
