/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Pacing copilot (RFC B3).
 *
 * Periodic, non-blocking pacing nudges that piggyback on the existing
 * proactive watchdog tick. Three nudge kinds:
 *
 *   - "break"        — fires when the current session crosses the user-
 *                      configured interval (default 45 min). Suggests
 *                      stepping away for a few minutes.
 *   - "long_session" — fires when the session passes the watchdog's
 *                      LONG_SESSION_THRESHOLD_MS (90 min, mirrors the
 *                      hyperfocus-formatter Tier C threshold). Stronger
 *                      hint to save state and stop.
 *   - "timebox"      — fires the first time a session begins (a fresh
 *                      translation after a >TIMEBOX_IDLE_GAP_MS idle
 *                      gap) when `timeboxOnStart` is enabled. Asks the
 *                      user if they want to set a 25 / 50 min box.
 *
 * Critical voice constraints (mirrored from
 * `packages/skills/hyperfocus-formatter/SKILL.md`):
 *   - NEVER the word "hyperfocus" in any user-facing string. The detector
 *     may use it internally, but every string this module emits to the
 *     UI is reviewed by `renderNudgeText`. The tripwire test
 *     `pacing-render-text.test.ts` fails the build if the substring
 *     leaks in.
 *   - NEVER the word "focused" either — the user spec explicitly bans
 *     both lowercase and any-case variations.
 *   - Suggestions, not commands. "Consider stepping away" not "Take a
 *     break now". No exclamation marks. Sentence case.
 *
 * OCD / AuDHD default-off. The pacing copilot does NOT auto-enable for
 * users whose `neurotypes` profile contains `"ocd"` or `"audhd"` —
 * unsolicited pacing prompts can feed rumination loops. Those users get
 * a one-time opt-in prompt; default is OFF and `ocdOptInShown=false`
 * until they engage with it.
 */
import type { HistoryEntry, Neurotype } from "./types.js";

export const PACING_PREFS_STORAGE_KEY = "neurodock.pacing.v1";

/** Allowed nudge intervals, exposed to the Settings UI. */
export type PacingInterval = 20 | 30 | 45 | 60;

export const PACING_INTERVAL_OPTIONS: readonly PacingInterval[] = [
  20, 30, 45, 60,
] as const;

export const DEFAULT_PACING_INTERVAL: PacingInterval = 45;

/**
 * Long-session threshold — mirrors the hyperfocus-formatter Tier C
 * threshold (90 minutes). When a session crosses this we emit the
 * stronger "long_session" nudge regardless of where the user is in
 * their break-interval cycle. Kept distinct from the watchdog count-
 * based hyperfocus signal: this one is purely about wall-clock time
 * sitting at the same task.
 */
export const LONG_SESSION_THRESHOLD_MS = 90 * 60 * 1000;

/**
 * Sessions are "contiguous" if successive translations are within this
 * idle gap. A gap larger than this resets the session anchor — the user
 * walked away and came back, so we don't keep counting from the morning.
 * Also serves as the timebox-trigger boundary (fresh translation after
 * a longer gap == session just started).
 */
export const SESSION_IDLE_GAP_MS = 30 * 60 * 1000;

/**
 * Minimum gap between any two nudges, regardless of kind. Spam-guard
 * mirroring the watchdog's 15-minute dedupe but slightly tighter so the
 * pacing surface stays predictable. A user who dismisses a 45-min break
 * nudge won't see anything new for at least 20 min.
 */
export const NUDGE_COOLDOWN_MS = 20 * 60 * 1000;

export type PacingNudgeKind = "break" | "timebox" | "long_session" | "none";

export interface PacingPreferences {
  readonly enabled: boolean;
  readonly intervalMinutes: PacingInterval;
  readonly timeboxOnStart: boolean;
  /**
   * Whether the one-time "Enable pacing nudges?" opt-in prompt has been
   * surfaced AND acted on by an OCD / AuDHD user. Only meaningful for
   * users whose neurotypes contain `ocd` or `audhd`. Default false so
   * the opt-in renders the first time those users open the popup; set
   * true once they tap either Enable or Not now.
   */
  readonly ocdOptInShown: boolean;
  readonly schemaVersion: 1;
}

export interface SessionState {
  /** Wall-clock instant the current contiguous session began, or null. */
  readonly sessionStartedAt: Date | null;
  /** Wall-clock instant of the most recent translation, or null. */
  readonly lastActivityAt: Date | null;
  /** True when `lastActivityAt` is within SESSION_IDLE_GAP_MS of `now`. */
  readonly sessionActive: boolean;
  /** True when this tick is the first one after a long idle gap. */
  readonly sessionJustStarted: boolean;
}

export interface PacingDecision {
  readonly kind: PacingNudgeKind;
  /** Minutes elapsed since `sessionStartedAt`; 0 when no session. */
  readonly minutesIn: number;
}

export interface PacingPersistedState {
  readonly preferences: PacingPreferences;
  /** ISO timestamp of the last nudge surfaced, or null. */
  readonly lastNudgeAt: string | null;
  /** ISO timestamp of the activity that anchored the last decision. */
  readonly lastSessionStartedAt: string | null;
}

const DEFAULT_PREFERENCES_NEUTRAL: PacingPreferences = Object.freeze({
  enabled: true,
  intervalMinutes: DEFAULT_PACING_INTERVAL,
  timeboxOnStart: true,
  ocdOptInShown: true,
  schemaVersion: 1,
});

const DEFAULT_PREFERENCES_OCD: PacingPreferences = Object.freeze({
  enabled: false,
  intervalMinutes: DEFAULT_PACING_INTERVAL,
  timeboxOnStart: false,
  ocdOptInShown: false,
  schemaVersion: 1,
});

/**
 * Compute defaults for a given neurotype set. Users with ocd or audhd
 * get the cautious default (off, prompt not yet shown). Everyone else
 * gets the standard 45-min nudge cycle.
 */
export function defaultPreferencesForNeurotypes(
  neurotypes: readonly Neurotype[],
): PacingPreferences {
  if (hasOcdOrAudhd(neurotypes)) {
    return DEFAULT_PREFERENCES_OCD;
  }
  return DEFAULT_PREFERENCES_NEUTRAL;
}

export function hasOcdOrAudhd(neurotypes: readonly Neurotype[]): boolean {
  for (const n of neurotypes) {
    if (n === "ocd" || n === "audhd") return true;
  }
  return false;
}

interface StorageLocalApi {
  readonly get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
}

function getStorageLocal(): StorageLocalApi | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageLocalApi } };
  };
  return g.chrome?.storage?.local ?? null;
}

function isInterval(value: unknown): value is PacingInterval {
  return value === 20 || value === 30 || value === 45 || value === 60;
}

function normalisePreferences(
  raw: unknown,
  neurotypes: readonly Neurotype[],
): PacingPreferences {
  const defaults = defaultPreferencesForNeurotypes(neurotypes);
  if (typeof raw !== "object" || raw === null) return defaults;
  const r = raw as Record<string, unknown>;
  const enabled =
    typeof r["enabled"] === "boolean" ? r["enabled"] : defaults.enabled;
  const intervalMinutes = isInterval(r["intervalMinutes"])
    ? r["intervalMinutes"]
    : defaults.intervalMinutes;
  const timeboxOnStart =
    typeof r["timeboxOnStart"] === "boolean"
      ? r["timeboxOnStart"]
      : defaults.timeboxOnStart;
  const ocdOptInShown =
    typeof r["ocdOptInShown"] === "boolean"
      ? r["ocdOptInShown"]
      : defaults.ocdOptInShown;
  return {
    enabled,
    intervalMinutes,
    timeboxOnStart,
    ocdOptInShown,
    schemaVersion: 1,
  };
}

interface StoredEnvelope {
  readonly preferences?: unknown;
  readonly lastNudgeAt?: unknown;
  readonly lastSessionStartedAt?: unknown;
}

/**
 * Load pacing preferences from `chrome.storage.local`, falling back to
 * defaults derived from the supplied neurotypes. Missing storage row =
 * first-run; emit the neurotype-specific defaults so OCD / AuDHD users
 * see the opt-in surface.
 */
export async function loadPacingPreferences(
  neurotypes: readonly Neurotype[] = [],
): Promise<PacingPreferences> {
  const persisted = await loadPersistedState(neurotypes);
  return persisted.preferences;
}

export async function loadPersistedState(
  neurotypes: readonly Neurotype[] = [],
): Promise<PacingPersistedState> {
  const defaults = defaultPreferencesForNeurotypes(neurotypes);
  const local = getStorageLocal();
  if (local === null) {
    return {
      preferences: defaults,
      lastNudgeAt: null,
      lastSessionStartedAt: null,
    };
  }
  try {
    const raw = await local.get(PACING_PREFS_STORAGE_KEY);
    const envelope = raw[PACING_PREFS_STORAGE_KEY] as
      | StoredEnvelope
      | undefined;
    if (!envelope || typeof envelope !== "object") {
      return {
        preferences: defaults,
        lastNudgeAt: null,
        lastSessionStartedAt: null,
      };
    }
    return {
      preferences: normalisePreferences(envelope.preferences, neurotypes),
      lastNudgeAt:
        typeof envelope.lastNudgeAt === "string" ? envelope.lastNudgeAt : null,
      lastSessionStartedAt:
        typeof envelope.lastSessionStartedAt === "string"
          ? envelope.lastSessionStartedAt
          : null,
    };
  } catch {
    return {
      preferences: defaults,
      lastNudgeAt: null,
      lastSessionStartedAt: null,
    };
  }
}

/**
 * Persist preferences to `chrome.storage.local`. The `lastNudgeAt` and
 * `lastSessionStartedAt` fields are preserved across writes — callers
 * use `recordNudge` to update them.
 */
export async function savePacingPreferences(
  preferences: PacingPreferences,
): Promise<void> {
  const local = getStorageLocal();
  if (local === null) return;
  const current = await loadPersistedState([]);
  const next: PacingPersistedState = {
    preferences,
    lastNudgeAt: current.lastNudgeAt,
    lastSessionStartedAt: current.lastSessionStartedAt,
  };
  await local.set({ [PACING_PREFS_STORAGE_KEY]: next });
}

/**
 * Record that a nudge fired at `at`. Persists the timestamp so the
 * cooldown survives service-worker restarts.
 */
export async function recordNudge(at: Date): Promise<void> {
  const local = getStorageLocal();
  if (local === null) return;
  const current = await loadPersistedState([]);
  const next: PacingPersistedState = {
    preferences: current.preferences,
    lastNudgeAt: at.toISOString(),
    lastSessionStartedAt: current.lastSessionStartedAt,
  };
  await local.set({ [PACING_PREFS_STORAGE_KEY]: next });
}

/**
 * Derive the current session state from a slice of history. A session
 * is the most recent contiguous stretch of activity with no
 * SESSION_IDLE_GAP_MS gap between successive entries (or between the
 * most recent entry and `now`).
 *
 * Pure function — no I/O — so it's straightforward to unit test.
 */
export function deriveSessionState(
  history: readonly HistoryEntry[],
  now: Date,
  previousSessionStartedAt: string | null = null,
): SessionState {
  if (history.length === 0) {
    return {
      sessionStartedAt: null,
      lastActivityAt: null,
      sessionActive: false,
      sessionJustStarted: false,
    };
  }
  // History is stored newest-first; walk it newest → oldest, breaking
  // when the gap to the next-older entry exceeds the idle threshold.
  const sorted = [...history].sort((a, b) => {
    const aMs = Date.parse(a.timestamp);
    const bMs = Date.parse(b.timestamp);
    return bMs - aMs;
  });
  const newestMs = Date.parse(sorted[0]!.timestamp);
  if (Number.isNaN(newestMs)) {
    return {
      sessionStartedAt: null,
      lastActivityAt: null,
      sessionActive: false,
      sessionJustStarted: false,
    };
  }
  const nowMs = now.getTime();
  const sessionActive = nowMs - newestMs <= SESSION_IDLE_GAP_MS;
  if (!sessionActive) {
    return {
      sessionStartedAt: null,
      lastActivityAt: new Date(newestMs),
      sessionActive: false,
      sessionJustStarted: false,
    };
  }
  // Walk back to find the session anchor.
  let anchorMs = newestMs;
  for (let i = 1; i < sorted.length; i++) {
    const ms = Date.parse(sorted[i]!.timestamp);
    if (Number.isNaN(ms)) break;
    if (anchorMs - ms > SESSION_IDLE_GAP_MS) break;
    anchorMs = ms;
  }
  const sessionStartedAt = new Date(anchorMs);
  const previousAnchor =
    previousSessionStartedAt !== null
      ? Date.parse(previousSessionStartedAt)
      : Number.NaN;
  // "Just started" = session anchor moved forward since last tick OR
  // there was no previous session at all AND we have exactly the
  // newest entry as the only thing in the session window.
  const anchorMovedForward =
    Number.isNaN(previousAnchor) || anchorMs > previousAnchor;
  const newEnoughToBeFresh = nowMs - anchorMs <= SESSION_IDLE_GAP_MS / 2;
  const sessionJustStarted = anchorMovedForward && newEnoughToBeFresh;
  return {
    sessionStartedAt,
    lastActivityAt: new Date(newestMs),
    sessionActive: true,
    sessionJustStarted,
  };
}

/**
 * Decide whether a nudge should fire and which kind. Pure function —
 * given a snapshot of session state + preferences + the timestamp of
 * the last nudge, return the decision. Returns `kind: "none"` when no
 * nudge applies.
 *
 * Resolution order (only one fires per call):
 *   1. Pacing disabled (or no active session) → none.
 *   2. Cooldown active → none.
 *   3. long_session (>= 90 min) wins over break.
 *   4. break (>= intervalMinutes).
 *   5. timebox (session just started AND timeboxOnStart) — only fires
 *      when nothing else does, so it never interrupts an existing
 *      session.
 */
export function shouldNudge(
  state: SessionState,
  preferences: PacingPreferences,
  now: Date,
  lastNudgeAt: Date | null = null,
): PacingDecision {
  if (!preferences.enabled) return { kind: "none", minutesIn: 0 };
  if (!state.sessionActive || state.sessionStartedAt === null) {
    return { kind: "none", minutesIn: 0 };
  }
  if (
    lastNudgeAt !== null &&
    now.getTime() - lastNudgeAt.getTime() < NUDGE_COOLDOWN_MS
  ) {
    return { kind: "none", minutesIn: 0 };
  }
  const elapsedMs = now.getTime() - state.sessionStartedAt.getTime();
  const minutesIn = Math.floor(elapsedMs / 60_000);
  if (elapsedMs >= LONG_SESSION_THRESHOLD_MS) {
    return { kind: "long_session", minutesIn };
  }
  if (minutesIn >= preferences.intervalMinutes) {
    return { kind: "break", minutesIn };
  }
  if (state.sessionJustStarted && preferences.timeboxOnStart) {
    return { kind: "timebox", minutesIn };
  }
  return { kind: "none", minutesIn };
}

export interface NudgeText {
  readonly title: string;
  readonly body: string;
}

/**
 * Produce the neutral-language nudge copy. Every string this function
 * emits is reviewed against the `no-hyperfocus / no-focused` tripwire
 * test. Sentence case, no exclamation marks, suggestion not command.
 */
export function renderNudgeText(
  kind: Exclude<PacingNudgeKind, "none">,
  minutesIn: number,
): NudgeText {
  const safeMinutes = Math.max(0, Math.floor(minutesIn));
  if (kind === "break") {
    return {
      title: "Pacing check",
      body:
        `You have been at this for ${safeMinutes} minutes. ` +
        "Consider stepping away for a few minutes when you can.",
    };
  }
  if (kind === "long_session") {
    return {
      title: "Long session",
      body:
        `This stretch is now ${safeMinutes} minutes long. ` +
        "Consider saving your work and taking a real break.",
    };
  }
  return {
    title: "Want to set a timebox?",
    body:
      "Starting a new stretch. A short box can help: 25 min or 50 min, " +
      "or no thanks.",
  };
}
