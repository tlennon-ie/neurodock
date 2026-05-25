/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Tests for the Pacing copilot (RFC B3) — pure decision logic.
 *
 * `shouldNudge` is a pure function over (SessionState, PacingPreferences,
 * now, lastNudgeAt). We drive it with hand-crafted state objects so the
 * tests are deterministic and free of storage / IndexedDB plumbing.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PACING_INTERVAL,
  LONG_SESSION_THRESHOLD_MS,
  NUDGE_COOLDOWN_MS,
  SESSION_IDLE_GAP_MS,
  deriveSessionState,
  shouldNudge,
  type PacingPreferences,
  type SessionState,
} from "../../src/lib/pacing.js";
import type { HistoryEntry } from "../../src/lib/types.js";

function prefs(overrides: Partial<PacingPreferences> = {}): PacingPreferences {
  return {
    enabled: true,
    intervalMinutes: DEFAULT_PACING_INTERVAL,
    timeboxOnStart: true,
    ocdOptInShown: true,
    schemaVersion: 1,
    ...overrides,
  };
}

function entry(timestamp: string): HistoryEntry {
  return {
    id: `e-${timestamp}`,
    tool: "translate_incoming",
    channel: "generic",
    timestamp,
    mode: "local",
    mockMode: false,
    provider: "lmstudio",
    inputPreview: "preview",
    outputSummary: "ok",
  };
}

function state(
  overrides: Partial<SessionState> & { sessionStartedAt?: Date | null } = {},
): SessionState {
  const sessionStartedAt =
    overrides.sessionStartedAt ?? new Date("2026-05-25T12:00:00.000Z");
  return {
    sessionStartedAt,
    lastActivityAt: overrides.lastActivityAt ?? sessionStartedAt,
    sessionActive: overrides.sessionActive ?? true,
    sessionJustStarted: overrides.sessionJustStarted ?? false,
  };
}

describe("shouldNudge", () => {
  it("returns none when preferences.enabled is false", () => {
    const now = new Date("2026-05-25T13:00:00.000Z"); // 60 min later
    const decision = shouldNudge(state(), prefs({ enabled: false }), now);
    expect(decision.kind).toBe("none");
  });

  it("returns none when there is no active session", () => {
    const now = new Date("2026-05-25T12:00:00.000Z");
    const decision = shouldNudge(
      state({ sessionActive: false, sessionStartedAt: null }),
      prefs(),
      now,
    );
    expect(decision.kind).toBe("none");
  });

  it("returns break exactly at intervalMinutes", () => {
    // 45 min interval, session started 45 min ago.
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + 45 * 60_000);
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt }),
      prefs({ intervalMinutes: 45 }),
      now,
    );
    expect(decision.kind).toBe("break");
    expect(decision.minutesIn).toBe(45);
  });

  it("returns none before intervalMinutes is reached", () => {
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + 44 * 60_000);
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt }),
      prefs({ intervalMinutes: 45 }),
      now,
    );
    expect(decision.kind).toBe("none");
  });

  it("returns long_session at the LONG_SESSION_THRESHOLD_MS boundary", () => {
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + LONG_SESSION_THRESHOLD_MS);
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt }),
      prefs({ intervalMinutes: 45 }),
      now,
    );
    expect(decision.kind).toBe("long_session");
    expect(decision.minutesIn).toBe(90);
  });

  it("long_session wins over break when both apply", () => {
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + 95 * 60_000);
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt }),
      prefs({ intervalMinutes: 30 }),
      now,
    );
    expect(decision.kind).toBe("long_session");
  });

  it("returns timebox when sessionJustStarted AND timeboxOnStart", () => {
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + 30_000); // 30s in
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt, sessionJustStarted: true }),
      prefs({ timeboxOnStart: true, intervalMinutes: 45 }),
      now,
    );
    expect(decision.kind).toBe("timebox");
  });

  it("does NOT return timebox when timeboxOnStart is false", () => {
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + 30_000);
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt, sessionJustStarted: true }),
      prefs({ timeboxOnStart: false }),
      now,
    );
    expect(decision.kind).toBe("none");
  });

  it("suppresses any nudge inside the cooldown window", () => {
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + 45 * 60_000);
    const lastNudge = new Date(now.getTime() - (NUDGE_COOLDOWN_MS - 60_000));
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt }),
      prefs({ intervalMinutes: 45 }),
      now,
      lastNudge,
    );
    expect(decision.kind).toBe("none");
  });

  it("re-allows nudges once the cooldown has elapsed", () => {
    const startedAt = new Date("2026-05-25T12:00:00.000Z");
    const now = new Date(startedAt.getTime() + 50 * 60_000);
    const lastNudge = new Date(now.getTime() - NUDGE_COOLDOWN_MS - 60_000);
    const decision = shouldNudge(
      state({ sessionStartedAt: startedAt }),
      prefs({ intervalMinutes: 45 }),
      now,
      lastNudge,
    );
    expect(decision.kind).toBe("break");
  });
});

describe("deriveSessionState", () => {
  it("returns null state for empty history", () => {
    const s = deriveSessionState([], new Date("2026-05-25T12:00:00.000Z"));
    expect(s.sessionActive).toBe(false);
    expect(s.sessionStartedAt).toBeNull();
  });

  it("treats history older than SESSION_IDLE_GAP_MS as no active session", () => {
    const old = new Date("2026-05-25T10:00:00.000Z").toISOString();
    const now = new Date("2026-05-25T12:00:00.000Z");
    const s = deriveSessionState([entry(old)], now);
    expect(s.sessionActive).toBe(false);
  });

  it("anchors session start to the oldest entry within the contiguous window", () => {
    const now = new Date("2026-05-25T12:00:00.000Z");
    const t = (offsetMin: number): string =>
      new Date(now.getTime() - offsetMin * 60_000).toISOString();
    // Three contiguous entries spaced 5-10 min apart, then a >30-min
    // gap to an older entry that should NOT anchor.
    const history = [entry(t(1)), entry(t(10)), entry(t(20)), entry(t(75))];
    const s = deriveSessionState(history, now);
    expect(s.sessionActive).toBe(true);
    // Anchor should be the t(20) entry — the next-older one is past the
    // idle gap.
    expect(s.sessionStartedAt?.toISOString()).toBe(t(20));
  });

  it("marks sessionJustStarted when there is a single fresh entry and no prior anchor", () => {
    const now = new Date("2026-05-25T12:00:00.000Z");
    const fresh = new Date(now.getTime() - 30_000).toISOString();
    const s = deriveSessionState([entry(fresh)], now);
    expect(s.sessionJustStarted).toBe(true);
  });

  it("does NOT mark sessionJustStarted when previous anchor matches", () => {
    const now = new Date("2026-05-25T12:00:00.000Z");
    const fresh = new Date(now.getTime() - 30_000).toISOString();
    const s = deriveSessionState([entry(fresh)], now, fresh);
    expect(s.sessionJustStarted).toBe(false);
  });

  it("ignores entries whose timestamp is unparseable", () => {
    const now = new Date("2026-05-25T12:00:00.000Z");
    const s = deriveSessionState([entry("not-a-date")], now);
    expect(s.sessionActive).toBe(false);
  });

  it("SESSION_IDLE_GAP_MS is exactly 30 minutes", () => {
    expect(SESSION_IDLE_GAP_MS).toBe(30 * 60 * 1000);
  });
});
