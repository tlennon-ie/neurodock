/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Toolbar-action badge state machine.
 *
 * Surfaces translation status on the browser toolbar icon so the user
 * doesn't have to watch the content-script panel or the popup to know
 * whether a request is in flight, succeeded, or failed. Pre-0.0.22 the
 * icon was inert — users right-clicked, saw nothing happen for several
 * seconds while gemma-4-e4b chewed on an image, and assumed the click
 * was lost.
 *
 * State → badge mapping:
 *
 *   - idle      → no badge
 *   - working   → "…" badge, neutral colour
 *   - success   → "✓" badge, green; auto-clears after SUCCESS_TTL_MS
 *   - error     → "!" badge, red;   auto-clears after ERROR_TTL_MS
 *   - mock      → "m" badge, amber; auto-clears after SUCCESS_TTL_MS
 *
 * Badge text is intentionally short (Chrome truncates badges to 4 ASCII
 * chars on most platforms, fewer on Firefox / Mac). The ✓ glyph renders
 * fine on Chrome MV3, Firefox WebExtensions, and Edge — verified during
 * 0.0.22 build.
 *
 * Title hover text mirrors the state so screen-reader users and anyone
 * who can't see the colour still get the signal. The action.setTitle
 * payload is read by the OS accessibility tree directly.
 */

export type BadgeState = "idle" | "working" | "success" | "error" | "mock";

const SUCCESS_TTL_MS = 4000;
const ERROR_TTL_MS = 8000;

const BADGES: Record<
  BadgeState,
  { text: string; color: string; title: string }
> = {
  idle: { text: "", color: "#56564f", title: "NeuroDock — Translate" },
  working: {
    text: "…",
    color: "#56564f",
    title: "NeuroDock — translating…",
  },
  success: {
    text: "✓",
    color: "#3a7d3a",
    title: "NeuroDock — translation ready",
  },
  error: {
    text: "!",
    color: "#a13d3d",
    title: "NeuroDock — translation error (open popup → History for detail)",
  },
  mock: {
    text: "m",
    color: "#c08a3a",
    title: "NeuroDock — mock response (configured provider unreachable)",
  },
};

interface ActionApi {
  readonly setBadgeText: (
    details: { text: string; tabId?: number },
    cb?: () => void,
  ) => void;
  readonly setBadgeBackgroundColor: (
    details: { color: string; tabId?: number },
    cb?: () => void,
  ) => void;
  readonly setTitle?: (
    details: { title: string; tabId?: number },
    cb?: () => void,
  ) => void;
}

function getActionApi(): ActionApi | null {
  const g = globalThis as unknown as {
    chrome?: { action?: ActionApi };
  };
  return g.chrome?.action ?? null;
}

// Per-tab auto-clear timers so a fast second translation doesn't get
// wiped by the previous translation's expiry callback.
const tabTimers = new Map<number | "global", ReturnType<typeof setTimeout>>();

function clearTabTimer(tabId: number | undefined): void {
  const key: number | "global" = tabId ?? "global";
  const existing = tabTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    tabTimers.delete(key);
  }
}

/**
 * Set the badge to a state. When `state` is "success", "mock", or
 * "error", schedules an automatic return to "idle" after the
 * state-specific TTL so the toolbar doesn't get stuck on a stale
 * indicator from a translation 20 minutes ago.
 *
 * `tabId` scopes the badge to a single tab when supplied — useful so
 * a translation in tab A doesn't visually overwrite the success
 * indicator from a separate translation in tab B. When omitted, the
 * badge is set globally.
 */
export function setActionBadge(state: BadgeState, tabId?: number): void {
  const api = getActionApi();
  if (api === null) return;
  const cfg = BADGES[state];
  clearTabTimer(tabId);
  try {
    const details = tabId !== undefined ? { tabId } : {};
    api.setBadgeText({ text: cfg.text, ...details }, noop);
    api.setBadgeBackgroundColor({ color: cfg.color, ...details }, noop);
    if (api.setTitle) {
      api.setTitle({ title: cfg.title, ...details }, noop);
    }
  } catch {
    // Toolbar API can throw if the extension is mid-reload or the tab
    // closed between the setBadgeText call and Chrome processing it.
    // Failure here is cosmetic only.
    return;
  }
  if (state === "success" || state === "mock") {
    scheduleClear(tabId, SUCCESS_TTL_MS);
  } else if (state === "error") {
    scheduleClear(tabId, ERROR_TTL_MS);
  }
}

function scheduleClear(tabId: number | undefined, ttlMs: number): void {
  const key: number | "global" = tabId ?? "global";
  const handle = setTimeout(() => {
    tabTimers.delete(key);
    setActionBadge("idle", tabId);
  }, ttlMs);
  tabTimers.set(key, handle);
}

function noop(): void {
  // chrome.action callbacks return void and the Chrome typings require
  // a callback when the second parameter is present; we don't care
  // about success/failure here.
}

/** Test-only escape hatch so vitest can verify timer cleanup. */
export function _clearAllTimersForTests(): void {
  for (const h of tabTimers.values()) clearTimeout(h);
  tabTimers.clear();
}
