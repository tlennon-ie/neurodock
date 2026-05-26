/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * @license AGPL-3.0-or-later
 *
 * "Open in tab" button shown in the popup header. Click opens the
 * full-tab view at chrome.runtime.getURL("tab.html"), optionally
 * forwarding the currently-active popup view via a URL hash so the
 * tab opens in the same section.
 *
 * The tab view is the spacious counterpart to the popup. The popup
 * itself is constrained to ~400×600 by the browser chrome and cannot
 * grow; users who want richer history, multi-pane settings, or the
 * notifications inbox open the tab instead.
 */
import React, { useCallback } from "react";

export interface OpenInTabButtonProps {
  /** Currently-active popup view, forwarded as `#view=…` if provided. */
  readonly view?: string;
  /** Optional override for tests. Defaults to chrome.tabs.create. */
  readonly onOpen?: (url: string) => void;
}

export function openTabUrl(view?: string): string {
  const chromeApi = (
    globalThis as unknown as {
      chrome?: { runtime?: { getURL?: (path: string) => string } };
    }
  ).chrome;
  const base =
    typeof chromeApi?.runtime?.getURL === "function"
      ? chromeApi.runtime.getURL("tab.html")
      : "tab.html";
  if (view && view.length > 0) {
    return `${base}#view=${encodeURIComponent(view)}`;
  }
  return base;
}

function defaultOpen(url: string): void {
  const chromeApi = (
    globalThis as unknown as {
      chrome?: { tabs?: { create?: (info: { url: string }) => unknown } };
    }
  ).chrome;
  if (typeof chromeApi?.tabs?.create === "function") {
    chromeApi.tabs.create({ url });
    return;
  }
  // Test/dev fallback so the click handler stays exercisable outside
  // the extension runtime. No-op when window.open is also unavailable.
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank");
  }
}

export function OpenInTabButton({
  view,
  onOpen,
}: OpenInTabButtonProps): React.ReactElement {
  const handle = useCallback((): void => {
    const url = openTabUrl(view);
    if (onOpen) {
      onOpen(url);
      return;
    }
    defaultOpen(url);
  }, [view, onOpen]);
  return (
    <button
      type="button"
      onClick={handle}
      data-testid="open-in-tab-button"
      aria-label="Open NeuroDock in a full browser tab"
      title="Open in tab"
      className="border-hairline bg-bg text-fg hover:bg-bg-nav focus-visible:outline-accent self-start border px-2 py-0.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Open in tab
    </button>
  );
}
