/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Shared header for the popup and the full-page tab. Mirrors the docs
 * site header: brand mark + wordmark on the left; reader-font switcher and
 * theme toggle on the right. Hairline bottom border, no shadow, slate accent.
 */
import React from "react";
import { ReaderFontSwitcher } from "./ReaderFontSwitcher.js";
import { ThemeModeToggle } from "./ThemeModeToggle.js";

function markUrl(): string {
  try {
    const rt = (
      globalThis as {
        chrome?: { runtime?: { getURL?: (p: string) => string } };
      }
    ).chrome?.runtime;
    return rt?.getURL ? rt.getURL("icon/32.png") : "icon/32.png";
  } catch {
    return "icon/32.png";
  }
}

interface NeuroDockHeaderProps {
  /** When provided, render a gear button that opens the full settings page. */
  readonly onOpenSettings?: () => void;
}

export function NeuroDockHeader({ onOpenSettings }: NeuroDockHeaderProps) {
  return (
    <header className="nd-header">
      <span className="nd-header-brand">
        <img
          className="nd-header-mark"
          src={markUrl()}
          alt=""
          width={20}
          height={20}
        />
        <span className="nd-header-wordmark" data-testid="nd-header-wordmark">
          NeuroDock
        </span>
      </span>
      <div className="nd-header-controls">
        <ReaderFontSwitcher />
        <ThemeModeToggle />
        {onOpenSettings && (
          <button
            type="button"
            className="nd-header-settings"
            data-testid="nd-header-settings"
            aria-label="Open settings"
            onClick={onOpenSettings}
          >
            ⚙
          </button>
        )}
      </div>
    </header>
  );
}
