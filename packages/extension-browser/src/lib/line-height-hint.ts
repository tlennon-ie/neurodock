/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * R5 UI hint: `line_height_hint` consumption (rendering).
 *
 * The merged profile schema added optional `preferences.line_height_hint`
 * (compact | default | relaxed) with a documented WCAG 1.4.8 / 1.4.12
 * CONFORMANCE FLOOR: body-paragraph line spacing MUST NOT render below
 * 1.5 regardless of band. This module is the single source of truth for
 * the band → body line-height mapping and for applying the hint as a
 * single `lh-<band>` class on the popup/tab <html> or the in-page
 * island's shadow host (mirrors `reader-font.ts`).
 *
 * Anchors (from the schema doc):
 *   - compact ≈ 1.5
 *   - default ≈ 1.5–1.6
 *   - relaxed ≈ 1.65–1.8 (currently 1.75)
 *
 * Focus-mode reconciliation (see tokens.css): focus-mode re-binds
 * `--nd-line-height` to 1.45 for tighter UI chrome. Body paragraphs read
 * `--nd-body-line-height` with a fallback to `--nd-line-height`:
 *   - No hint set  → `--nd-body-line-height` is undefined, so body falls
 *     back to `--nd-line-height` (today's behaviour exactly, including
 *     focus-mode's 1.45).
 *   - Hint set     → the `lh-*` class binds `--nd-body-line-height` to a
 *     value >= 1.5, which focus-mode never touches, so a hinted body
 *     paragraph can never drop below the WCAG floor.
 */
import type { LineHeightHint } from "./types.js";

/**
 * WCAG 1.4.8 (Visual Presentation) / 1.4.12 (Text Spacing) line-height
 * floor for body paragraphs. No band may render body text below this.
 */
export const WCAG_LINE_HEIGHT_FLOOR = 1.5 as const;

/**
 * Body line-height per band. Every value is >= the WCAG floor.
 *   - compact : sits exactly at the floor.
 *   - default : the surface default rhythm.
 *   - relaxed : the most generous band.
 */
const BAND_LINE_HEIGHT: Readonly<Record<LineHeightHint, number>> =
  Object.freeze({
    compact: 1.5,
    default: 1.6,
    relaxed: 1.75,
  });

export const LINE_HEIGHT_HINT_CLASSES = [
  "lh-compact",
  "lh-default",
  "lh-relaxed",
] as const;

/**
 * Map a band to its body line-height, clamped so a future edit can never
 * accidentally drop a band below the WCAG floor.
 */
export function lineHeightForHint(hint: LineHeightHint): number {
  return Math.max(BAND_LINE_HEIGHT[hint], WCAG_LINE_HEIGHT_FLOOR);
}

/** Map a band to its `lh-*` class name. */
export function lineHeightHintClass(
  hint: LineHeightHint,
): (typeof LINE_HEIGHT_HINT_CLASSES)[number] {
  return `lh-${hint}` as const;
}

/**
 * Apply the line-height hint to a Document's <html> or a ShadowRoot's
 * host element. Idempotent: removes every other lh-* class first. An
 * undefined hint clears all lh-* classes so the body falls back to
 * `--nd-line-height` (today's behaviour).
 */
export function applyLineHeightHintToDocument(
  hint: LineHeightHint | undefined,
  target: Document | ShadowRoot = document,
): void {
  const el: Element =
    target instanceof ShadowRoot ? target.host : target.documentElement;
  el.classList.remove(...LINE_HEIGHT_HINT_CLASSES);
  if (hint !== undefined) {
    el.classList.add(lineHeightHintClass(hint));
  }
}
