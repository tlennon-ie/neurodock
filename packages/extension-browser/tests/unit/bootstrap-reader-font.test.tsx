/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyReaderFontToDocument,
  loadReaderFont,
} from "../../src/lib/reader-font.js";
import { mountIsland } from "../../entrypoints/_shared/mountIsland.js";

describe("island reader-font application", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("applies the stored font to the shadow host", () => {
    localStorage.setItem("neurodockFont", "opendyslexic");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    applyReaderFontToDocument(loadReaderFont(), shadow);
    expect(host.classList.contains("font-opendyslexic")).toBe(true);
    host.remove();
  });
});

describe("island stylesheet font-class contract", () => {
  const HOST_ID = "nd-test-font-contract";

  afterEach(() => {
    document.getElementById(HOST_ID)?.remove();
  });

  it("shadow stylesheet contains :host(.font-opendyslexic) rule and OpenDyslexic @font-face", () => {
    // Arrange + Act
    const island = mountIsland(HOST_ID);

    // Assert — the injected <style> element is present in the shadow
    const styleEl = island.shadow.querySelector("style");
    expect(styleEl).not.toBeNull();

    const css = styleEl!.textContent ?? "";

    // The font-variant host rules must be present so the class applied by
    // applyReaderFontToDocument actually resolves inside the shadow tree.
    expect(css).toContain(":host(.font-opendyslexic)");
    expect(css).toContain(":host(.font-comic)");
    expect(css).toContain(":host(.font-lexend)");
    expect(css).toContain(":host(.font-system)");
    expect(css).toContain(":host(.font-atkinson)");

    // The @font-face declarations for the two new fonts must be bundled so
    // the shadow tree can resolve them via fontUrl() → chrome.runtime.getURL.
    expect(css).toContain('"OpenDyslexic"');
    expect(css).toContain("opendyslexic-400.woff2");
    expect(css).toContain("opendyslexic-700.woff2");
    expect(css).toContain('"Comic Neue"');
    expect(css).toContain("comic-neue-400.woff2");
    expect(css).toContain("comic-neue-700.woff2");

    // The component classes must use the font variables, not hardcoded stacks.
    expect(css).toContain("font-family: var(--nd-font-body)");
    expect(css).toContain("font-family: var(--nd-font-heading)");

    island.destroy();
  });

  it("shadow stylesheet carries the per-font metric compensation scale", () => {
    // Arrange + Act
    const island = mountIsland(HOST_ID);
    const css = island.shadow.querySelector("style")!.textContent ?? "";

    // The island sheet is px-based, so the rem trick in tokens.css does
    // not reach it. The compensation mechanism is a custom property
    // (--nd-island-font-scale) defaulting to 1, overridden per font
    // class, and multiplied into every text-size declaration via calc().
    expect(css).toMatch(/:host\s*{[^}]*--nd-island-font-scale:\s*1\b/);
    expect(css).toMatch(
      /:host\(\.font-opendyslexic\)\s*{[^}]*--nd-island-font-scale:\s*0\.85/,
    );
    expect(css).toMatch(
      /:host\(\.font-comic\)\s*{[^}]*--nd-island-font-scale:\s*0\.95/,
    );

    // Every px text size must be multiplied by the scale.
    expect(css).toContain(
      "font-size: calc(14px * var(--nd-island-font-scale, 1))",
    );
    expect(css).toContain(
      "font-size: calc(13px * var(--nd-island-font-scale, 1))",
    );
    // No unscaled px font-size declarations may remain.
    expect(css).not.toMatch(/font-size:\s*\d+px/);

    // Bigger glyphs must wrap inside the panel, not overflow it.
    expect(css).toMatch(/\.neurodock-panel\s*{[^}]*overflow-wrap:\s*anywhere/);

    island.destroy();
  });
});
