/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Accessibility preferences (RFC A3).
 *
 * Three toggles, persisted under `neurodock.a11y.v1` in
 * `chrome.storage.local` (never `sync`). Kept separate from the larger
 * `ExtensionProfile` blob so the popup and tab surfaces can apply the
 * theme classes BEFORE the full profile resolves — a paint with the
 * default theme followed by a paint with the user's high-contrast
 * preference would itself be an accessibility regression.
 *
 *   highContrast — bumps `--nd-color-fg` to pure-ish on `--nd-color-bg`
 *                  pure-ish (inverted in dark mode), promotes hairlines
 *                  to bolder strokes, and forces the focus ring to 3px.
 *   focusMode    — distraction-reduced surface. Collapses every Section
 *                  closed-by-default in the in-page panel, hides the
 *                  cloud-mode banner while idle, tightens line-height
 *                  to 1.45, and caps the reading measure to ~55ch on
 *                  the tab view.
 *   schemaVersion — pinned to 1. Future migrations bump this and add a
 *                   normaliser branch in `loadA11yPreferences`.
 *
 * Apply via `applyA11yToDocument(prefs, root)` — toggles two classes on
 * the root element (`nd-high-contrast`, `nd-focus-mode`). The CSS
 * variants live in `src/styles/tokens.css` so popup, tab view, and the
 * shadow-DOM islands all pick up the same rules from the same source.
 */

const STORAGE_KEY = "neurodock.a11y.v1";

const HIGH_CONTRAST_CLASS = "nd-high-contrast";
const FOCUS_MODE_CLASS = "nd-focus-mode";

export const A11Y_STORAGE_KEY = STORAGE_KEY;

export interface AccessibilityPreferences {
  readonly highContrast: boolean;
  readonly focusMode: boolean;
  readonly schemaVersion: 1;
}

export const DEFAULT_A11Y_PREFERENCES: AccessibilityPreferences = Object.freeze(
  {
    highContrast: false,
    focusMode: false,
    schemaVersion: 1,
  },
);

interface StorageLike {
  readonly get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/**
 * Normalise unknown input into a strict AccessibilityPreferences value.
 * Missing fields fall back to the defaults; unknown fields are dropped.
 */
function normalise(input: unknown): AccessibilityPreferences {
  if (!isRecord(input)) {
    return DEFAULT_A11Y_PREFERENCES;
  }
  return {
    highContrast: input.highContrast === true,
    focusMode: input.focusMode === true,
    schemaVersion: 1,
  };
}

/**
 * Read the persisted preferences. Missing key returns the defaults
 * (no destructive overwrite — the caller is responsible for saving on
 * first user opt-in).
 */
export async function loadA11yPreferences(): Promise<AccessibilityPreferences> {
  const storage = getStorage();
  try {
    const result = await storage.get(STORAGE_KEY);
    return normalise(result[STORAGE_KEY]);
  } catch {
    // chrome.storage rejection is rare in production; falling back to
    // defaults keeps the popup paintable rather than crashing the
    // accessibility surface.
    return DEFAULT_A11Y_PREFERENCES;
  }
}

export async function saveA11yPreferences(
  prefs: AccessibilityPreferences,
): Promise<void> {
  const storage = getStorage();
  await storage.set({ [STORAGE_KEY]: normalise(prefs) });
}

/**
 * Idempotent — toggles the two class names on the supplied root.
 *
 * Accepts both `Document` (popup + tab) and `ShadowRoot` (per-site
 * content-script island). When a ShadowRoot is passed, the class is set
 * on its `host` element so CSS variants declared on
 * `:host(.nd-high-contrast)` / `:host(.nd-focus-mode)` resolve. When a
 * Document is passed, the class lands on `document.documentElement`.
 */
export function applyA11yToDocument(
  prefs: AccessibilityPreferences,
  root: Document | ShadowRoot,
): void {
  const target = resolveClassTarget(root);
  if (target === null) return;
  toggleClass(target, HIGH_CONTRAST_CLASS, prefs.highContrast);
  toggleClass(target, FOCUS_MODE_CLASS, prefs.focusMode);
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
