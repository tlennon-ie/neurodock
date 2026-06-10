/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_READER_FONT,
  READER_FONT_STORAGE_KEY,
  READER_FONT_CLASSES,
  applyReaderFontToDocument,
  loadReaderFont,
  normaliseReaderFont,
  saveReaderFont,
} from "../../src/lib/reader-font.js";

describe("reader-font — storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to atkinson when no key is present", () => {
    expect(loadReaderFont()).toBe(DEFAULT_READER_FONT);
    expect(DEFAULT_READER_FONT).toBe("atkinson");
  });

  it("round-trips a save of 'opendyslexic'", () => {
    saveReaderFont("opendyslexic");
    expect(localStorage.getItem(READER_FONT_STORAGE_KEY)).toBe("opendyslexic");
    expect(loadReaderFont()).toBe("opendyslexic");
  });

  it("normalises garbage to the default", () => {
    localStorage.setItem(READER_FONT_STORAGE_KEY, "rainbow");
    expect(loadReaderFont()).toBe(DEFAULT_READER_FONT);
    expect(normaliseReaderFont(42)).toBe(DEFAULT_READER_FONT);
  });
});

describe("reader-font — applyReaderFontToDocument", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("adds font-opendyslexic and removes any prior font class", () => {
    applyReaderFontToDocument("comic", document);
    applyReaderFontToDocument("opendyslexic", document);
    const cls = document.documentElement.classList;
    expect(cls.contains("font-opendyslexic")).toBe(true);
    expect(cls.contains("font-comic")).toBe(false);
  });

  it("only ever has one font-* class at a time", () => {
    for (const f of ["atkinson", "lexend", "comic", "system"] as const) {
      applyReaderFontToDocument(f, document);
    }
    const present = READER_FONT_CLASSES.filter((c) =>
      document.documentElement.classList.contains(c),
    );
    expect(present).toEqual(["font-system"]);
  });

  it("applies to a ShadowRoot's host element", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    applyReaderFontToDocument("lexend", shadow);
    expect(host.classList.contains("font-lexend")).toBe(true);
    host.remove();
  });
});
