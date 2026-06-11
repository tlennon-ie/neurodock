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
});
