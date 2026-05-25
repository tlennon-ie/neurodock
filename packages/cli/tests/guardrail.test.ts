/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect } from "vitest";
import {
  collectGuardrailStatus,
  runGuardrailStatus,
} from "../src/commands/guardrail.js";

describe("neurodock guardrail status", () => {
  it("returns a structured result with one line per check", () => {
    const result = collectGuardrailStatus();
    expect(result.lines.length).toBeGreaterThanOrEqual(5);
    for (const line of result.lines) {
      expect(typeof line.label).toBe("string");
      expect(typeof line.ok).toBe("boolean");
      expect(typeof line.detail).toBe("string");
    }
  });

  it("flags anyFailure when at least one check fails", () => {
    const result = collectGuardrailStatus();
    const failures = result.lines.filter((line) => !line.ok).length;
    if (failures === 0) {
      expect(result.anyFailure).toBe(false);
    } else {
      expect(result.anyFailure).toBe(true);
    }
  });

  it("runGuardrailStatus prints labelled lines via the supplied print fn", () => {
    const printed: string[] = [];
    const r = runGuardrailStatus({ print: (m) => printed.push(m) });
    expect(printed.length).toBeGreaterThan(0);
    expect(printed.join("\n")).toMatch(/wiring status/i);
    expect(printed.some((m) => /OK|MISSING/.test(m))).toBe(true);
    expect([0, 1]).toContain(r.exitCode);
  });
});
