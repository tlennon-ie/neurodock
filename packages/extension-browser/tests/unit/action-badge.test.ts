/**
 * 0.0.22 — toolbar action badge state machine.
 *
 * Verifies the badge text + colour + title set for each state, and
 * that success/mock/error states auto-clear back to idle after their
 * TTL. Uses vi.useFakeTimers to drive the auto-clear timer
 * deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setActionBadge,
  _clearAllTimersForTests,
} from "../../src/lib/action-badge.js";

interface BadgeCall {
  text: string;
  tabId?: number;
}
interface ColorCall {
  color: string;
  tabId?: number;
}
interface TitleCall {
  title: string;
  tabId?: number;
}

let badgeCalls: BadgeCall[];
let colorCalls: ColorCall[];
let titleCalls: TitleCall[];
let originalAction: typeof chrome.action | undefined;

beforeEach(() => {
  badgeCalls = [];
  colorCalls = [];
  titleCalls = [];
  originalAction = chrome.action;
  (chrome as { action: unknown }).action = {
    setBadgeText: (details: BadgeCall, cb?: () => void): void => {
      badgeCalls.push(details);
      cb?.();
    },
    setBadgeBackgroundColor: (details: ColorCall, cb?: () => void): void => {
      colorCalls.push(details);
      cb?.();
    },
    setTitle: (details: TitleCall, cb?: () => void): void => {
      titleCalls.push(details);
      cb?.();
    },
  };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  _clearAllTimersForTests();
  if (originalAction !== undefined) {
    (chrome as { action: typeof chrome.action }).action = originalAction;
  }
});

describe("setActionBadge", () => {
  it("sets the working badge with neutral colour and elapsis text", () => {
    setActionBadge("working", 42);
    const last = badgeCalls[badgeCalls.length - 1];
    expect(last?.text).toBe("…");
    expect(last?.tabId).toBe(42);
    const color = colorCalls[colorCalls.length - 1];
    expect(color?.color).toBe("#56564f");
  });

  it("success state auto-clears to idle after TTL", () => {
    setActionBadge("success", 7);
    expect(badgeCalls.filter((c) => c.text === "✓").length).toBeGreaterThan(0);
    vi.advanceTimersByTime(4001);
    // After TTL the timer fired and idle text was set.
    const lastBadge = badgeCalls[badgeCalls.length - 1];
    expect(lastBadge?.text).toBe("");
  });

  it("error state auto-clears with a longer TTL than success", () => {
    setActionBadge("error", 9);
    vi.advanceTimersByTime(4001);
    // Still showing the "!" badge because error TTL is 8000ms.
    const midBadge = badgeCalls[badgeCalls.length - 1];
    expect(midBadge?.text).toBe("!");
    vi.advanceTimersByTime(4001);
    const lastBadge = badgeCalls[badgeCalls.length - 1];
    expect(lastBadge?.text).toBe("");
  });

  it("mock state uses its own glyph + amber colour", () => {
    setActionBadge("mock", 3);
    const last = badgeCalls[badgeCalls.length - 1];
    expect(last?.text).toBe("m");
    const color = colorCalls[colorCalls.length - 1];
    expect(color?.color).toBe("#c08a3a");
  });

  it("setTitle reflects the state for screen-reader users", () => {
    setActionBadge("working", 1);
    const last = titleCalls[titleCalls.length - 1];
    expect(last?.title).toMatch(/translating/i);
  });

  it("setting a new state cancels the previous auto-clear timer", () => {
    setActionBadge("success", 5);
    vi.advanceTimersByTime(2000);
    setActionBadge("working", 5);
    vi.advanceTimersByTime(3000);
    // The original success auto-clear would have fired at 4000ms total
    // — but we replaced with working at 2000ms. The badge should now
    // still be "…" (working has no auto-clear).
    const lastBadge = badgeCalls[badgeCalls.length - 1];
    expect(lastBadge?.text).toBe("…");
  });
});
