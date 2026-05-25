/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Pacing copilot service-worker runtime wiring (RFC B3).
 *
 * Separated from `pacing.ts` so the pure decision logic stays free of
 * chrome.* dependencies and trivially unit-testable.
 *
 * Responsibilities:
 *   - Tick every 5 min (mirrors the existing watchdog cadence).
 *   - On each tick: load history slice + pacing preferences + profile
 *     neurotypes; run `deriveSessionState` + `shouldNudge`.
 *   - When a nudge fires: append it to the in-extension notifications
 *     inbox AND broadcast a `watchdog:nudge` runtime message so any
 *     mounted content-script island can render a toast.
 *   - Update `lastNudgeAt` so the cooldown survives SW restarts.
 *
 * Never throws — a broken pacing ticker must not break translation.
 */
import { loadProfile } from "./profile.js";
import { listHistory } from "./storage.js";
import { appendNotification } from "./notifications.js";
import {
  deriveSessionState,
  loadPersistedState,
  recordNudge,
  renderNudgeText,
  shouldNudge,
  type PacingNudgeKind,
} from "./pacing.js";

const TICK_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 7_000;

interface RuntimeApi {
  readonly sendMessage?: (msg: unknown) => unknown;
}

function getRuntime(): RuntimeApi | null {
  const g = globalThis as unknown as { chrome?: { runtime?: RuntimeApi } };
  return g.chrome?.runtime ?? null;
}

function broadcastNudge(
  kind: Exclude<PacingNudgeKind, "none">,
  minutesIn: number,
): void {
  const runtime = getRuntime();
  const send = runtime?.sendMessage;
  if (!send) return;
  try {
    const result = send({
      type: "watchdog:nudge",
      kind,
      minutesIn,
    });
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // Runtime API missing / threw — non-fatal; the inbox row is still
    // appended below so the user can find the nudge after the fact.
  }
}

async function tick(): Promise<void> {
  try {
    const profile = await loadProfile();
    const persisted = await loadPersistedState(profile.neurotypes);
    const preferences = persisted.preferences;
    if (!preferences.enabled) return;
    const history = await listHistory(200);
    const now = new Date();
    const sessionState = deriveSessionState(
      history,
      now,
      persisted.lastSessionStartedAt,
    );
    const lastNudgeAt = persisted.lastNudgeAt
      ? new Date(persisted.lastNudgeAt)
      : null;
    const decision = shouldNudge(sessionState, preferences, now, lastNudgeAt);
    if (decision.kind === "none") return;
    const text = renderNudgeText(decision.kind, decision.minutesIn);
    try {
      await appendNotification({
        category: "watchdog",
        subcategory: `pacing_${decision.kind}`,
        title: text.title,
        body: text.body,
        meta: { kind: decision.kind, minutesIn: decision.minutesIn },
      });
    } catch {
      // Inbox write is non-essential — never let it block the broadcast.
    }
    broadcastNudge(decision.kind, decision.minutesIn);
    try {
      await recordNudge(now);
    } catch {
      // Persistence failure means a duplicate could fire next tick.
      // Acceptable trade-off vs failing the user-visible nudge.
    }
  } catch (cause: unknown) {
    // eslint-disable-next-line no-console
    console.warn(
      "[neurodock.pacing] tick failed:",
      cause instanceof Error ? cause.message : cause,
    );
  }
}

/**
 * Start the pacing ticker. Returns a cleanup function used by tests.
 * The SW lets the interval run for its lifetime.
 */
export function startPacingTicker(): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  setTimeout(() => {
    if (cancelled) return;
    void tick();
  }, STARTUP_DELAY_MS);
  timer = setInterval(() => {
    if (cancelled) return;
    void tick();
  }, TICK_INTERVAL_MS);
  return () => {
    cancelled = true;
    if (timer !== null) clearInterval(timer);
  };
}
