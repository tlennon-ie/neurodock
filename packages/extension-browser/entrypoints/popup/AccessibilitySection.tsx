/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Settings → Accessibility section (RFC A3).
 *
 * Renders the two toggles backed by `src/lib/accessibility.ts` plus a
 * read-only keyboard map block. The component owns its own load + save
 * cycle (independent of `ExtensionProfile`) so the popup can paint the
 * preference-driven theme classes before profile load completes.
 *
 * Sentence case copy per the design contract. No emojis, no marketing
 * intensifiers. The helper text describes the user-visible effect of
 * each toggle in literal terms.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  applyA11yToDocument,
  DEFAULT_A11Y_PREFERENCES,
  loadA11yPreferences,
  saveA11yPreferences,
  type AccessibilityPreferences,
} from "../../src/lib/accessibility.js";

export function AccessibilitySection(): React.ReactElement {
  const [prefs, setPrefs] = useState<AccessibilityPreferences>(
    DEFAULT_A11Y_PREFERENCES,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await loadA11yPreferences();
      if (cancelled) return;
      setPrefs(initial);
      setLoaded(true);
      // Re-apply on mount so a fresh popup window picks up the persisted
      // preferences even if its App-level loader has not run yet. Idempotent.
      if (typeof document !== "undefined") {
        applyA11yToDocument(initial, document);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<AccessibilityPreferences>) => {
      const next: AccessibilityPreferences = {
        ...prefs,
        ...patch,
        schemaVersion: 1,
      };
      setPrefs(next);
      if (typeof document !== "undefined") {
        applyA11yToDocument(next, document);
      }
      try {
        await saveA11yPreferences(next);
      } catch {
        // Revert local state on persistence failure so the UI reflects
        // the actual stored value. The previous value is in `prefs`
        // (closure) — easier than re-loading.
        setPrefs(prefs);
        if (typeof document !== "undefined") {
          applyA11yToDocument(prefs, document);
        }
      }
    },
    [prefs],
  );

  return (
    <fieldset
      className="border-hairline m-0 flex flex-col gap-3 border p-3"
      data-testid="accessibility-section"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Accessibility
      </legend>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.highContrast}
          disabled={!loaded}
          onChange={(e) => void update({ highContrast: e.target.checked })}
          className="mt-0.5"
          data-testid="a11y-high-contrast-toggle"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">High-contrast theme</span>
          <span className="text-fg-muted text-sm">
            Pure-ish black-on-white (or inverted in dark mode) with bolder
            hairlines and 3-pixel focus rings.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.focusMode}
          disabled={!loaded}
          onChange={(e) => void update({ focusMode: e.target.checked })}
          className="mt-0.5"
          data-testid="a11y-focus-mode-toggle"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Focus mode</span>
          <span className="text-fg-muted text-sm">
            Collapses sections by default, hides the cloud banner when idle, and
            tightens line-height.
          </span>
        </span>
      </label>

      <KeyboardMap />
    </fieldset>
  );
}

function KeyboardMap(): React.ReactElement {
  return (
    <div
      className="border-hairline bg-bg-nav text-fg-muted flex flex-col gap-0.5 border p-2 text-sm"
      data-testid="a11y-keyboard-map"
      aria-label="Keyboard shortcuts"
    >
      <span className="text-fg font-medium">Keyboard map</span>
      <span>
        <kbd className="font-mono">Tab</kbd> to move between controls.
      </span>
      <span>
        <kbd className="font-mono">Enter</kbd> or{" "}
        <kbd className="font-mono">Space</kbd> to activate the focused control.
      </span>
      <span>
        <kbd className="font-mono">Esc</kbd> to close any open disclosure or
        section.
      </span>
      <span>
        <kbd className="font-mono">Arrow keys</kbd> to move between tabs in the
        popup tab bar.
      </span>
    </div>
  );
}
