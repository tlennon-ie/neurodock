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
  /** When provided, render an expand button that opens the full-page view. */
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
            aria-label="Open full view"
            title="Open full view"
            onClick={onOpenSettings}
          >
            {/* Expand icon (YouTube-fullscreen style): four corner
                brackets pointing outward. currentColor so it themes. */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
