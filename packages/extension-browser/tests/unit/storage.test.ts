import { describe, it, expect, beforeEach } from "vitest";
import {
  appendHistory,
  clearHistory,
  listHistory,
  truncatePreview,
  _resetForTests,
} from "../../src/lib/storage.js";
import type { HistoryEntry } from "../../src/lib/types.js";

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tool: overrides.tool ?? "translate_incoming",
    channel: overrides.channel ?? "slack",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    mode: overrides.mode ?? "local",
    mockMode: overrides.mockMode ?? true,
    inputPreview: overrides.inputPreview ?? "some input",
    outputSummary: overrides.outputSummary ?? "mock",
  };
}

describe("storage history", () => {
  beforeEach(async () => {
    _resetForTests();
    await clearHistory();
  });

  it("appends and lists entries newest-first", async () => {
    await appendHistory(
      makeEntry({ id: "a", timestamp: "2026-01-01T00:00:00Z" }),
    );
    await appendHistory(
      makeEntry({ id: "b", timestamp: "2026-01-02T00:00:00Z" }),
    );
    const entries = await listHistory();
    expect(entries.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("truncates long previews via the truncate helper", () => {
    const long = "x".repeat(500);
    const out = truncatePreview(long);
    expect(out.length).toBeLessThanOrEqual(256);
    expect(out.endsWith("…")).toBe(true);
  });

  it("never persists full long text bodies", async () => {
    const huge = "y".repeat(5000);
    await appendHistory(makeEntry({ id: "c", inputPreview: huge }));
    const [entry] = await listHistory();
    expect(entry!.inputPreview.length).toBeLessThanOrEqual(256);
  });
});
