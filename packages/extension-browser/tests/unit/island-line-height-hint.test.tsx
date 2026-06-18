/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * R5 line_height_hint — in-page island surface wiring.
 *
 * When the profile resolved over `profile:get` carries `lineHeightHint`,
 * bootstrapContent must apply the matching `lh-*` class to the island's
 * shadow-root HOST element so `:host(.lh-*)` binds --nd-body-line-height
 * (>= 1.5). No hint → no lh-* class (today's behaviour).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";

vi.mock("../../entrypoints/_shared/contentApp.js", () => ({
  ContentApp: vi.fn(() => null),
}));

import { bootstrapContent } from "../../entrypoints/_shared/bootstrap.js";
import { mountIsland } from "../../entrypoints/_shared/mountIsland.js";
import { LINE_HEIGHT_HINT_CLASSES } from "../../src/lib/line-height-hint.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

const HOST_ID = "nd-lh-island";

function buildProfile(
  overrides: Partial<ExtensionProfile> = {},
): ExtensionProfile {
  return {
    mode: "local",
    localProvider: "ollama",
    localEndpoint: "http://localhost:11434",
    localModel: "llama3.2:3b",
    localApiKey: null,
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    cloudApiKeys: {},
    historyEnabled: false,
    displayName: "you",
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
    ...overrides,
  };
}

describe("island — line_height_hint wiring (R5)", () => {
  let originalSendMessage: typeof chrome.runtime.sendMessage;

  beforeEach(() => {
    originalSendMessage = chrome.runtime.sendMessage;
  });

  afterEach(() => {
    (chrome.runtime as Record<string, unknown>)["sendMessage"] =
      originalSendMessage;
    document.getElementById(HOST_ID)?.remove();
    vi.restoreAllMocks();
  });

  it("applies lh-compact to the shadow host when the profile carries the hint", async () => {
    (chrome.runtime as Record<string, unknown>)["sendMessage"] = vi
      .fn()
      .mockResolvedValue(buildProfile({ lineHeightHint: "compact" }));

    let cleanup!: () => void;
    await act(async () => {
      cleanup = bootstrapContent({ channel: "email", hostId: HOST_ID });
    });

    const host = document.getElementById(HOST_ID);
    expect(host).not.toBeNull();
    expect(host!.classList.contains("lh-compact")).toBe(true);
    cleanup();
  });

  it("applies no lh-* class to the host when the profile has no hint", async () => {
    (chrome.runtime as Record<string, unknown>)["sendMessage"] = vi
      .fn()
      .mockResolvedValue(buildProfile());

    let cleanup!: () => void;
    await act(async () => {
      cleanup = bootstrapContent({ channel: "email", hostId: HOST_ID });
    });

    const host = document.getElementById(HOST_ID);
    const present = LINE_HEIGHT_HINT_CLASSES.filter((c) =>
      host!.classList.contains(c),
    );
    expect(present).toEqual([]);
    cleanup();
  });
});

describe("island stylesheet — line_height_hint conformance floor", () => {
  // The island has its own hand-written stylesheet (`:host{all:initial}`
  // severs inherited custom properties — the WS1 lesson). So the band
  // rules and the focus-mode reconciliation must live in mountIsland.ts.
  function islandCss(): string {
    const island = mountIsland("nd-css-probe");
    const style = island.shadow.querySelector("style");
    const css = style?.textContent ?? "";
    island.destroy();
    return css;
  }

  afterEach(() => {
    document.getElementById("nd-css-probe")?.remove();
  });

  it("the panel body reads --nd-body-line-height with a >=1.5 fallback", () => {
    const css = islandCss();
    expect(css).toMatch(
      /\.neurodock-panel\s*{[^}]*line-height:\s*var\(\s*--nd-body-line-height\s*,\s*1\.5\s*\)/,
    );
  });

  it("declares the three lh-* band bindings on the host (>=1.5)", () => {
    const css = islandCss();
    expect(css).toMatch(
      /:host\(\.lh-compact\)\s*{[^}]*--nd-body-line-height:\s*1\.5\b/,
    );
    expect(css).toMatch(
      /:host\(\.lh-default\)\s*{[^}]*--nd-body-line-height:\s*1\.6\b/,
    );
    expect(css).toMatch(
      /:host\(\.lh-relaxed\)\s*{[^}]*--nd-body-line-height:\s*1\.75\b/,
    );
  });

  it("focus-mode no longer hard-pins the panel to 1.45 below the floor", () => {
    // The pre-R5 island pinned `.neurodock-panel { line-height: 1.45 }`
    // under focus mode. That would drop a hinted body paragraph below the
    // WCAG floor. Focus mode must now route through the same
    // --nd-body-line-height variable so a set hint always wins at >=1.5.
    const css = islandCss();
    expect(css).not.toMatch(
      /:host\(\.nd-focus-mode\)\s*\.neurodock-panel\s*{[^}]*line-height:\s*1\.45/,
    );
  });

  /**
   * Resolve the effective `.neurodock-panel` body line-height the way a
   * browser would, for a given set of host classes:
   *   1. A focus-mode panel override (`:host(.nd-focus-mode) .neurodock-panel
   *      { line-height: N }`) wins outright if it exists — this is exactly the
   *      sub-1.5 rule we removed, so re-adding it MUST flip the result.
   *   2. Otherwise the panel reads `var(--nd-body-line-height, <fallback>)`.
   *      `--nd-body-line-height` is bound only by an active `:host(.lh-*)`
   *      band class; with no band class it is undefined, so the declared
   *      fallback applies.
   */
  function resolvePanelLineHeight(css: string, hostClasses: string[]): number {
    const hasClass = (c: string): boolean => hostClasses.includes(c);

    // 1. Focus-mode panel override (the removed sub-floor rule).
    if (hasClass("nd-focus-mode")) {
      const override = css.match(
        /:host\(\.nd-focus-mode\)\s*\.neurodock-panel\s*{[^}]*line-height:\s*([\d.]+)/,
      );
      if (override) return Number(override[1]);
    }

    // 2. Resolve --nd-body-line-height from any active lh-* band class.
    const bandRules: Array<[string, number]> = [
      ["lh-compact", 1.5],
      ["lh-default", 1.6],
      ["lh-relaxed", 1.75],
    ];
    for (const [cls, value] of bandRules) {
      if (hasClass(cls)) return value;
    }

    // 3. No band → the panel's declared fallback applies.
    const fallback = css.match(
      /\.neurodock-panel\s*{[^}]*line-height:\s*var\(\s*--nd-body-line-height\s*,\s*([\d.]+)\s*\)/,
    );
    if (!fallback) throw new Error("panel line-height fallback not found");
    return Number(fallback[1]);
  }

  it("floors an un-hinted panel body at 1.5 under focus-mode (not 1.45)", () => {
    // code-reviewer MEDIUM lock: removing the island focus-mode panel rule
    // means an un-hinted body paragraph under focus-mode now resolves to the
    // panel's --nd-body-line-height fallback (1.5) instead of the old 1.45.
    // 1.45 was below the WCAG 1.4.8 / 1.4.12 body floor; 1.5 is INTENTIONAL
    // and CORRECT. This guards against anyone re-adding a sub-1.5 island
    // focus-mode body rule (which would flip this back to 1.45 and fail).
    const css = islandCss();
    const resolved = resolvePanelLineHeight(css, ["nd-focus-mode"]);
    expect(resolved).toBe(1.5);
    expect(resolved).toBeGreaterThanOrEqual(1.5);
    expect(resolved).not.toBe(1.45);
  });
});
