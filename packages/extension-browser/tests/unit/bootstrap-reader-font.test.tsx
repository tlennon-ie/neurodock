/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyReaderFontToDocument,
  loadReaderFont,
} from "../../src/lib/reader-font.js";

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
