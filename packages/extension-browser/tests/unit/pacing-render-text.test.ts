/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Tripwire: `renderNudgeText` must NEVER produce strings containing
 * "hyperfocus" or "focused" in any case. The clinical-voice constraint
 * lives in `packages/skills/hyperfocus-formatter/SKILL.md`. If this
 * test fails, the build fails — the copy MUST be reworded before the
 * change can ship.
 *
 * Also pins the exact wording for the three nudge kinds so a future
 * copy change is an explicit decision, not a drive-by edit.
 */
import { describe, it, expect } from "vitest";
import { renderNudgeText } from "../../src/lib/pacing.js";

const BANNED_SUBSTRINGS: readonly string[] = ["hyperfocus", "focused", "focus"];

function assertNoBannedSubstring(value: string): void {
  const lower = value.toLowerCase();
  for (const banned of BANNED_SUBSTRINGS) {
    if (lower.includes(banned)) {
      throw new Error(
        `Banned substring "${banned}" found in pacing copy: ${JSON.stringify(
          value,
        )}`,
      );
    }
  }
}

describe("renderNudgeText — clinical voice tripwire", () => {
  const cases = [
    { kind: "break" as const, minutesIn: 45 },
    { kind: "break" as const, minutesIn: 47 },
    { kind: "long_session" as const, minutesIn: 92 },
    { kind: "timebox" as const, minutesIn: 0 },
  ];

  for (const c of cases) {
    it(`${c.kind} copy never contains "hyperfocus" / "focused" / "focus"`, () => {
      const text = renderNudgeText(c.kind, c.minutesIn);
      assertNoBannedSubstring(text.title);
      assertNoBannedSubstring(text.body);
    });
  }

  it("break copy uses neutral language and includes the minute count", () => {
    const text = renderNudgeText("break", 47);
    expect(text.title).toBe("Pacing check");
    expect(text.body).toContain("47 minutes");
    expect(text.body.toLowerCase()).toContain("consider");
    // Suggestion not command — no exclamation marks.
    expect(text.body).not.toMatch(/!/);
  });

  it("long_session copy is a stronger suggestion but still non-imperative", () => {
    const text = renderNudgeText("long_session", 95);
    expect(text.title).toBe("Long session");
    expect(text.body).toContain("95 minutes");
    expect(text.body.toLowerCase()).toContain("consider");
    expect(text.body).not.toMatch(/!/);
  });

  it("timebox copy offers options, never demands", () => {
    const text = renderNudgeText("timebox", 0);
    expect(text.title.toLowerCase()).toContain("timebox");
    expect(text.body).toContain("25 min");
    expect(text.body).toContain("50 min");
    expect(text.body.toLowerCase()).toContain("no thanks");
    expect(text.body).not.toMatch(/!/);
  });

  it("guards against negative minutesIn (clamps to 0)", () => {
    const text = renderNudgeText("break", -10);
    expect(text.body).toContain("0 minutes");
  });
});
