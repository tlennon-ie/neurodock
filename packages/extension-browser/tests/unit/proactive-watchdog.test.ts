/**
 * Tests for the Phase 2 extension proactive watchdog.
 *
 * The signal-evaluation function is pure (no I/O), so we drive it
 * with fake history + a fake "now" and assert the right signal type
 * fires. The setInterval lifecycle is verified separately via fake
 * timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_WATCHDOG_CONFIG,
  evaluateSignals,
  renderSignal,
  startWatchdog,
  type WatchdogConfig,
} from "../../src/lib/proactive-watchdog.js";
import type { HistoryEntry } from "../../src/lib/types.js";

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: overrides.id ?? `e-${Math.random()}`,
    tool: overrides.tool ?? "translate_incoming",
    channel: overrides.channel ?? "generic",
    timestamp: overrides.timestamp ?? "2026-05-24T12:00:00.000Z",
    mode: overrides.mode ?? "local",
    mockMode: overrides.mockMode ?? false,
    provider: overrides.provider ?? "lmstudio",
    inputPreview: overrides.inputPreview ?? "preview",
    outputSummary: overrides.outputSummary ?? "ok",
    request: overrides.request,
    response: overrides.response,
  };
}

const config: WatchdogConfig = DEFAULT_WATCHDOG_CONFIG;

describe("evaluateSignals", () => {
  it("returns null when history is empty (no signals)", () => {
    const now = new Date("2026-05-24T14:00:00.000Z");
    expect(evaluateSignals([], config, now)).toBeNull();
  });

  it("fires hyperfocus when count >= threshold in the rolling window", () => {
    const now = new Date("2026-05-24T14:00:00.000Z");
    const history = Array.from(
      { length: config.hyperfocusThresholdCount },
      (_, i) =>
        entry({
          id: `h-${i}`,
          timestamp: new Date(now.getTime() - i * 60_000).toISOString(),
        }),
    );
    const signal = evaluateSignals(history, config, now);
    expect(signal?.type).toBe("hyperfocus");
    if (signal?.type === "hyperfocus") {
      expect(signal.count).toBe(config.hyperfocusThresholdCount);
    }
  });

  it("does NOT fire hyperfocus when entries are older than the window", () => {
    const now = new Date("2026-05-24T14:00:00.000Z");
    const stale = new Date(now.getTime() - config.hyperfocusWindowMs - 60_000);
    const history = Array.from(
      { length: config.hyperfocusThresholdCount },
      () => entry({ timestamp: stale.toISOString() }),
    );
    expect(evaluateSignals(history, config, now)).toBeNull();
  });

  it("fires deep_night when local hour is 0-5 and >=1 translation since midnight", () => {
    // Synthesize a "now" at 02:30 local and a translation 30 min ago.
    const now = new Date(2026, 4, 24, 2, 30, 0); // local, May 24 02:30
    const justAfterMidnight = new Date(2026, 4, 24, 0, 5, 0);
    const history = [entry({ timestamp: justAfterMidnight.toISOString() })];
    const signal = evaluateSignals(history, config, now);
    expect(signal?.type).toBe("deep_night");
    if (signal?.type === "deep_night") {
      expect(signal.localHour).toBe(2);
      expect(signal.count).toBeGreaterThanOrEqual(1);
    }
  });

  it("does NOT fire deep_night at 14:00 even with many translations", () => {
    const now = new Date(2026, 4, 24, 14, 0, 0);
    const history = Array.from({ length: 3 }, () =>
      entry({ timestamp: now.toISOString() }),
    );
    const signal = evaluateSignals(history, config, now);
    expect(signal?.type).not.toBe("deep_night");
  });

  it("fires rumination_host when a single host crosses the per-host threshold", () => {
    const now = new Date("2026-05-24T14:00:00.000Z");
    const history = Array.from(
      { length: config.ruminationThresholdCount },
      (_, i) =>
        entry({
          id: `r-${i}`,
          timestamp: new Date(now.getTime() - i * 5 * 60_000).toISOString(),
          request: {
            tool: "translate_incoming",
            input: { page_url: "https://www.linkedin.com/feed" },
          },
        }),
    );
    const signal = evaluateSignals(history, config, now);
    expect(signal?.type).toBe("rumination_host");
    if (signal?.type === "rumination_host") {
      expect(signal.host).toBe("www.linkedin.com");
      expect(signal.count).toBeGreaterThanOrEqual(
        config.ruminationThresholdCount,
      );
    }
  });

  it("rumination_host ignores entries with no page_url", () => {
    const now = new Date("2026-05-24T14:00:00.000Z");
    const history = Array.from(
      { length: config.ruminationThresholdCount },
      () => entry({ timestamp: now.toISOString() }),
    );
    const signal = evaluateSignals(history, config, now);
    // With no page_url, no host can be extracted — so rumination doesn't
    // fire even though count exceeds the threshold.
    expect(signal?.type).not.toBe("rumination_host");
  });
});

describe("renderSignal", () => {
  it("hyperfocus copy mentions translation count + window", () => {
    const out = renderSignal({
      type: "hyperfocus",
      count: 15,
      windowMinutes: 30,
    });
    expect(out.title).toMatch(/hyperfocus/i);
    expect(out.message).toContain("15");
    expect(out.message).toContain("30");
  });

  it("deep_night copy mentions local hour + count since midnight", () => {
    const out = renderSignal({
      type: "deep_night",
      count: 4,
      localHour: 2,
    });
    expect(out.title).toMatch(/late-night/i);
    expect(out.message).toContain("02:00");
    expect(out.message).toContain("4");
  });

  it("rumination_host copy mentions the offending host", () => {
    const out = renderSignal({
      type: "rumination_host",
      host: "www.linkedin.com",
      count: 9,
    });
    expect(out.message).toContain("www.linkedin.com");
  });
});

describe("startWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire when isEnabled returns false", async () => {
    const notify = vi.fn();
    const cleanup = startWatchdog(
      {
        listHistory: vi.fn(),
        isEnabled: async () => false,
        notify: { notify },
        now: () => new Date("2026-05-24T14:00:00.000Z"),
      },
      config,
    );
    await vi.advanceTimersByTimeAsync(config.tickIntervalMs + 6_000);
    expect(notify).not.toHaveBeenCalled();
    cleanup();
  });

  it("calls notify when a signal trips", async () => {
    const now = new Date("2026-05-24T14:00:00.000Z");
    const history = Array.from(
      { length: config.hyperfocusThresholdCount },
      (_, i) =>
        entry({
          id: `h-${i}`,
          timestamp: new Date(now.getTime() - i * 30_000).toISOString(),
        }),
    );
    const notify = vi.fn();
    const cleanup = startWatchdog(
      {
        listHistory: async () => history,
        isEnabled: async () => true,
        notify: { notify },
        now: () => now,
      },
      config,
    );
    // Initial 5s settle, then a tick.
    await vi.advanceTimersByTimeAsync(6_000);
    expect(notify).toHaveBeenCalled();
    const [title] = notify.mock.calls[0]!;
    expect(title as string).toMatch(/hyperfocus/i);
    cleanup();
  });
});
