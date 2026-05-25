/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Three-state theme toggle (system / light / dark).
 *
 * Renders a single small button in the popup + tab headers. Click
 * cycles through the three states in the order System → Light → Dark
 * → System. The icon and `aria-label` reflect the CURRENT mode (not
 * the next one) so a screen reader user hears "Theme: system" /
 * "Theme: light" / "Theme: dark" rather than a hidden next-action
 * verb.
 *
 * Icons are inline SVG so the popup does not need an extra font /
 * image round-trip. Sized 16px to match the surrounding header
 * controls (Open in tab button etc.).
 *
 * Apply is synchronous on click — `applyThemeModeToDocument` writes
 * the class on the same render tick — so the user sees the palette
 * flip without a reload. Persistence is async and best-effort; a
 * failed `chrome.storage.local.set` is logged but does not block the
 * visual flip.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_THEME_MODE,
  applyThemeModeToDocument,
  loadThemeMode,
  saveThemeMode,
  type ThemeMode,
} from "../lib/theme-mode.js";

const ORDER: readonly ThemeMode[] = ["system", "light", "dark"];

function nextMode(current: ThemeMode): ThemeMode {
  const idx = ORDER.indexOf(current);
  const next = ORDER[(idx + 1) % ORDER.length];
  return next ?? "system";
}

function labelFor(mode: ThemeMode): string {
  if (mode === "light") return "Theme: light";
  if (mode === "dark") return "Theme: dark";
  return "Theme: system";
}

function titleFor(mode: ThemeMode): string {
  const next = nextMode(mode);
  if (next === "light") return "Switch to light theme";
  if (next === "dark") return "Switch to dark theme";
  return "Switch to system theme";
}

export interface ThemeModeToggleProps {
  /**
   * Optional override for the icon size in pixels. Defaults to 16 to
   * match the popup header's compact controls; the tab view passes
   * 18 for slightly more presence on a wider surface.
   */
  readonly iconSize?: number;
}

export function ThemeModeToggle({
  iconSize = 16,
}: ThemeModeToggleProps): React.ReactElement {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await loadThemeMode();
      if (cancelled) return;
      setMode(initial);
      setLoaded(true);
      if (typeof document !== "undefined") {
        applyThemeModeToDocument(initial, document);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cycle = useCallback((): void => {
    const next = nextMode(mode);
    setMode(next);
    if (typeof document !== "undefined") {
      applyThemeModeToDocument(next, document);
    }
    // Persistence is async + best-effort. The visual flip already
    // happened above, so a failure here only affects the next session.
    void saveThemeMode(next);
  }, [mode]);

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={!loaded}
      aria-label={labelFor(mode)}
      title={titleFor(mode)}
      data-testid="theme-mode-toggle"
      data-theme-mode={mode}
      className="border-hairline bg-bg text-fg hover:bg-bg-nav focus-visible:outline-accent inline-flex items-center justify-center border p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <ThemeIcon mode={mode} size={iconSize} />
    </button>
  );
}

interface ThemeIconProps {
  readonly mode: ThemeMode;
  readonly size: number;
}

function ThemeIcon({ mode, size }: ThemeIconProps): React.ReactElement {
  if (mode === "light") return <SunIcon size={size} />;
  if (mode === "dark") return <MoonIcon size={size} />;
  return <SystemIcon size={size} />;
}

interface IconProps {
  readonly size: number;
}

function SunIcon({ size }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ size }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SystemIcon({ size }: IconProps): React.ReactElement {
  // Half-filled disc — universal "follow OS / auto" glyph used by both
  // GitHub and Starlight. The filled left half communicates "could be
  // either" without picking sun or moon.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
