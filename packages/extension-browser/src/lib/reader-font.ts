/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Reader-font preference (neurodivergent font hinting).
 *
 * Mirrors the docs site's font switcher (docs/src/overrides/SiteTitle.astro)
 * byte-for-byte at the contract level so the two surfaces agree:
 *   - localStorage key: `neurodockFont`
 *   - values: atkinson | lexend | opendyslexic | comic | system
 *   - <html> (or shadow host) gets a single `font-<value>` class; tokens.css
 *     re-binds --nd-font-body / --nd-font-heading under each class.
 *
 * Why localStorage (not chrome.storage.local like theme-mode.ts): the choice
 * must be applied BEFORE first paint to avoid a flash of unhinted text, and
 * only localStorage is synchronous. It is a pure display preference, so the
 * weaker durability vs the profile is acceptable; profile-synced fonts are a
 * future enhancement.
 */

export type ReaderFont =
  | "atkinson"
  | "lexend"
  | "opendyslexic"
  | "comic"
  | "system";

export const READER_FONT_STORAGE_KEY = "neurodockFont";
export const DEFAULT_READER_FONT: ReaderFont = "atkinson";

export const READER_FONT_CLASSES = [
  "font-atkinson",
  "font-lexend",
  "font-opendyslexic",
  "font-comic",
  "font-system",
] as const;

// Derived from READER_FONT_CLASSES so the allowed values never drift.
const ALLOWED: ReadonlySet<string> = new Set(
  READER_FONT_CLASSES.map((c) => c.slice("font-".length)),
);

export function normaliseReaderFont(raw: unknown): ReaderFont {
  return typeof raw === "string" && ALLOWED.has(raw)
    ? (raw as ReaderFont)
    : DEFAULT_READER_FONT;
}

export function loadReaderFont(
  store: Pick<Storage, "getItem"> = localStorage,
): ReaderFont {
  try {
    return normaliseReaderFont(store.getItem(READER_FONT_STORAGE_KEY));
  } catch {
    return DEFAULT_READER_FONT;
  }
}

export function saveReaderFont(
  font: ReaderFont,
  store: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    store.setItem(READER_FONT_STORAGE_KEY, font);
  } catch {
    /* storage blocked — apply for this session only */
  }
}

/**
 * Apply the font class to a Document's <html> or a ShadowRoot's host element.
 * Idempotent: removes every other font-* class first.
 */
export function applyReaderFontToDocument(
  font: ReaderFont,
  target: Document | ShadowRoot = document,
): void {
  const el: Element =
    target instanceof ShadowRoot ? target.host : target.documentElement;
  el.classList.remove(...READER_FONT_CLASSES);
  el.classList.add(`font-${font}`);
}
