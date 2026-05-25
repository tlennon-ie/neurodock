/**
 * Extension proactive watchdog (Phase 2 of the proactive-guardrails
 * proposal — see `.claude-reports/2026-05-24-proactive-guardrails/PROPOSAL.md`).
 *
 * Pre-this-fix the only way NeuroDock's safety surfaces fired was if
 * the user manually invoked an MCP tool. ND users in hyperfocus by
 * definition forget to do that, so the protection nobody asked for at
 * the moment they most needed it. This module flips the pattern from
 * pull-by-user to push-by-watchdog: a background ticker that watches
 * the extension's own activity stream and surfaces an interventional
 * notification + amber toolbar badge when one of three patterns trips.
 *
 * Three signals, evaluated every tick (default 5 min):
 *
 *   1. Translation hyperfocus — number of translations the user has
 *      run in the rolling window exceeds the per-window threshold.
 *      Default: 12 translations in 30 minutes. The translation surface
 *      is itself a "doing work" proxy on the browser side, so a tight
 *      back-to-back streak past midnight is a strong hyperfocus signal.
 *   2. Deep-night band — local time is in 00:00..05:59 AND at least one
 *      translation has run since midnight. Crossing midnight while
 *      still firing translations is the loudest possible signal that
 *      the user has lost track of time.
 *   3. Rumination on a single host — same host received >= N
 *      translations in the last hour. Default N=8. Often correlates
 *      with the user re-reading the same inbox / PR thread and asking
 *      NeuroDock to re-decode it from slightly different angles.
 *
 * None of these block. None of them are clinical. They are advisory
 * notifications the user can dismiss; the underlying counter resets
 * after surfacing so the same signal doesn't re-fire on the next tick.
 *
 * Opt-out: `chrome.storage.local.set({ "neurodock.watchdog.enabled": false })`
 * or the Settings UI toggle. The watchdog never registers a setInterval
 * when disabled. Pre-this-fix there was no opt-out because the
 * watchdog didn't exist.
 */
import { setActionBadge } from "./action-badge.js";
import type { HistoryEntry } from "./types.js";

export interface WatchdogConfig {
  readonly enabled: boolean;
  readonly tickIntervalMs: number;
  /** Hyperfocus: max translations in the rolling window before we nudge. */
  readonly hyperfocusThresholdCount: number;
  readonly hyperfocusWindowMs: number;
  /** Rumination: max translations against a single host per window before we nudge. */
  readonly ruminationThresholdCount: number;
  readonly ruminationWindowMs: number;
}

export const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
  enabled: true,
  tickIntervalMs: 5 * 60 * 1000, // 5 min
  hyperfocusThresholdCount: 12,
  hyperfocusWindowMs: 30 * 60 * 1000, // 30 min
  ruminationThresholdCount: 8,
  ruminationWindowMs: 60 * 60 * 1000, // 60 min
};

export type WatchdogSignal =
  | { type: "hyperfocus"; count: number; windowMinutes: number }
  | { type: "deep_night"; count: number; localHour: number }
  | { type: "rumination_host"; host: string; count: number };

export interface NotifyAdapter {
  /**
   * Show a Chrome notification with the given title + body. The third
   * argument is the originating signal (subcategory + counts) so the
   * caller can route the same event into the in-extension notifications
   * inbox AND honour per-category mutes. The lib never inspects the
   * signal — it's pass-through only.
   */
  readonly notify: (
    title: string,
    message: string,
    signal?: WatchdogSignal,
  ) => void;
}

export interface WatchdogDeps {
  /** Pull the rolling history slice from IndexedDB. */
  readonly listHistory: (limit: number) => Promise<readonly HistoryEntry[]>;
  /** Read the cached watchdog enabled-flag (chrome.storage.local). */
  readonly isEnabled: () => Promise<boolean>;
  /** Optional notification surface. Falls back to console.warn. */
  readonly notify?: NotifyAdapter;
  /** Test seam: source of "now". */
  readonly now?: () => Date;
}

/**
 * Evaluate the three signals against a snapshot of history. Pure
 * function — no I/O — so it's the unit-testable heart of the
 * watchdog. Returns at most one signal per evaluation; hyperfocus
 * wins ties because the next-tick will catch lesser signals if they
 * are still present.
 */
export function evaluateSignals(
  history: readonly HistoryEntry[],
  config: WatchdogConfig,
  now: Date,
): WatchdogSignal | null {
  const nowMs = now.getTime();
  // 1. Hyperfocus by raw count in the rolling window.
  const hyperfocusFrom = nowMs - config.hyperfocusWindowMs;
  const inHyperfocusWindow = history.filter(
    (e) => Date.parse(e.timestamp) >= hyperfocusFrom,
  );
  if (inHyperfocusWindow.length >= config.hyperfocusThresholdCount) {
    return {
      type: "hyperfocus",
      count: inHyperfocusWindow.length,
      windowMinutes: Math.round(config.hyperfocusWindowMs / 60000),
    };
  }

  // 2. Deep-night band — at least one translation post-midnight local.
  const localHour = now.getHours();
  if (localHour >= 0 && localHour < 6) {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const postMidnight = history.filter(
      (e) => Date.parse(e.timestamp) >= midnight.getTime(),
    );
    if (postMidnight.length > 0) {
      return {
        type: "deep_night",
        count: postMidnight.length,
        localHour,
      };
    }
  }

  // 3. Rumination on a single host.
  const ruminationFrom = nowMs - config.ruminationWindowMs;
  const perHost = new Map<string, number>();
  for (const entry of history) {
    if (Date.parse(entry.timestamp) < ruminationFrom) continue;
    // HistoryEntry has `request?.input.page_url`; fall back to inputPreview
    // for back-compat with pre-0.0.21 rows that didn't persist request.
    const host = extractHostFromEntry(entry);
    if (host === null) continue;
    perHost.set(host, (perHost.get(host) ?? 0) + 1);
  }
  for (const [host, count] of perHost.entries()) {
    if (count >= config.ruminationThresholdCount) {
      return { type: "rumination_host", host, count };
    }
  }
  return null;
}

function extractHostFromEntry(entry: HistoryEntry): string | null {
  const url = (entry.request?.input as Record<string, unknown> | undefined)?.[
    "page_url"
  ];
  const raw = typeof url === "string" ? url : "";
  if (raw.length === 0) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * Render the signal as a user-facing notification body. Mirrors the
 * Python-hook banner voice — direct, non-clinical, dismissible.
 */
export function renderSignal(signal: WatchdogSignal): {
  title: string;
  message: string;
} {
  if (signal.type === "hyperfocus") {
    return {
      title: "NeuroDock — hyperfocus check",
      message:
        `${signal.count} translations in ~${signal.windowMinutes} min. ` +
        "Worth a real break — walk, hydrate, switch context for 10 min.",
    };
  }
  if (signal.type === "deep_night") {
    return {
      title: "NeuroDock — late-night check",
      message:
        `Local time ${String(signal.localHour).padStart(2, "0")}:00. ` +
        `${signal.count} translation(s) since midnight. ` +
        "Save your work and stop for the day if you can.",
    };
  }
  return {
    title: "NeuroDock — rumination check",
    message:
      `${signal.count} translations on ${signal.host} in the last hour. ` +
      "Stepping back from the thread for 5 min may help more than the next decode.",
  };
}

/**
 * Wire the watchdog into a long-lived context (the service worker).
 * Returns a cleanup that clears the interval — used by tests; in the
 * SW the interval persists for the lifetime of the worker.
 *
 * Defensively wrapped — any thrown error from the heuristic evaluation
 * is logged to console.warn and swallowed. A broken watchdog must
 * never block the translation pipeline.
 */
export function startWatchdog(
  deps: WatchdogDeps,
  config: WatchdogConfig = DEFAULT_WATCHDOG_CONFIG,
): () => void {
  const now = deps.now ?? (() => new Date());
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  // Remember the last signal kind we surfaced this minute so a fast
  // tick after a dismiss doesn't immediately re-fire the same nudge.
  let lastSurfacedAt: { kind: WatchdogSignal["type"]; at: number } | null =
    null;
  const DEDUP_WINDOW_MS = 15 * 60 * 1000;

  const tick = async (): Promise<void> => {
    if (cancelled) return;
    try {
      const enabled = await deps.isEnabled();
      if (!enabled) return;
      const history = await deps.listHistory(200);
      const signal = evaluateSignals(history, config, now());
      if (signal === null) return;
      const nowMs = now().getTime();
      if (
        lastSurfacedAt !== null &&
        lastSurfacedAt.kind === signal.type &&
        nowMs - lastSurfacedAt.at < DEDUP_WINDOW_MS
      ) {
        return;
      }
      const rendered = renderSignal(signal);
      if (deps.notify) {
        deps.notify.notify(rendered.title, rendered.message, signal);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[neurodock.watchdog] ${rendered.title}: ${rendered.message}`,
        );
      }
      // Paint the toolbar badge amber so a glance at the icon shows
      // there's something to read in the notification tray.
      try {
        setActionBadge("mock");
      } catch {
        // setActionBadge is a no-op in non-extension contexts (tests).
      }
      lastSurfacedAt = { kind: signal.type, at: nowMs };
    } catch (cause: unknown) {
      // eslint-disable-next-line no-console
      console.warn(
        "[neurodock.watchdog] tick failed:",
        cause instanceof Error ? cause.message : cause,
      );
    }
  };

  // Fire once at startup (delayed slightly so we don't race the SW
  // bootstrap), then on a steady interval.
  setTimeout(() => void tick(), 5000);
  timer = setInterval(() => void tick(), config.tickIntervalMs);

  return () => {
    cancelled = true;
    if (timer !== null) clearInterval(timer);
  };
}
