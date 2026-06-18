/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Unit tests for the R5 `line_height_hint` consumption path.
 *
 * Contract:
 *   - The mapping function returns a body line-height per band, NEVER
 *     below the WCAG 1.4.8 / 1.4.12 conformance floor of 1.5.
 *   - The class applier toggles exactly one `lh-*` class on the root /
 *     shadow host (mirrors reader-font.ts), so tokens.css can re-bind
 *     `--nd-body-line-height` under that class.
 *   - An absent / unknown hint applies no class (today's behaviour).
 *   - tokens.css declares each band's `--nd-body-line-height` >= 1.5 and
 *     binds the body to that variable so focus-mode's 1.45 cannot drop a
 *     hinted body paragraph below the floor.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import {
  LINE_HEIGHT_HINT_CLASSES,
  WCAG_LINE_HEIGHT_FLOOR,
  applyLineHeightHintToDocument,
  lineHeightForHint,
  lineHeightHintClass,
} from "../../src/lib/line-height-hint.js";
import type { LineHeightHint } from "../../src/lib/types.js";

describe("line-height-hint — mapping respects the WCAG 1.5 floor", () => {
  it("floor constant is 1.5", () => {
    expect(WCAG_LINE_HEIGHT_FLOOR).toBe(1.5);
  });

  it("compact maps to ~1.5 (at the floor, never below)", () => {
    expect(lineHeightForHint("compact")).toBeGreaterThanOrEqual(1.5);
    expect(lineHeightForHint("compact")).toBeLessThanOrEqual(1.55);
  });

  it("default maps within the 1.5–1.6 anchor band", () => {
    expect(lineHeightForHint("default")).toBeGreaterThanOrEqual(1.5);
    expect(lineHeightForHint("default")).toBeLessThanOrEqual(1.6);
  });

  it("relaxed maps within the 1.65–1.8 anchor band", () => {
    expect(lineHeightForHint("relaxed")).toBeGreaterThanOrEqual(1.65);
    expect(lineHeightForHint("relaxed")).toBeLessThanOrEqual(1.8);
  });

  it("every band is monotonic and >= the floor", () => {
    const bands: LineHeightHint[] = ["compact", "default", "relaxed"];
    const values = bands.map(lineHeightForHint);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(WCAG_LINE_HEIGHT_FLOOR);
    }
    expect(values[0]).toBeLessThanOrEqual(values[1]!);
    expect(values[1]).toBeLessThanOrEqual(values[2]!);
  });
});

describe("line-height-hint — class mapping", () => {
  it("maps each hint to its lh-* class", () => {
    expect(lineHeightHintClass("compact")).toBe("lh-compact");
    expect(lineHeightHintClass("default")).toBe("lh-default");
    expect(lineHeightHintClass("relaxed")).toBe("lh-relaxed");
  });
});

describe("line-height-hint — applyLineHeightHintToDocument", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("applies lh-relaxed and removes any prior lh-* class", () => {
    applyLineHeightHintToDocument("compact", document);
    applyLineHeightHintToDocument("relaxed", document);
    const cls = document.documentElement.classList;
    expect(cls.contains("lh-relaxed")).toBe(true);
    expect(cls.contains("lh-compact")).toBe(false);
  });

  it("only ever has one lh-* class at a time", () => {
    for (const h of ["compact", "default", "relaxed"] as const) {
      applyLineHeightHintToDocument(h, document);
    }
    const present = LINE_HEIGHT_HINT_CLASSES.filter((c) =>
      document.documentElement.classList.contains(c),
    );
    expect(present).toEqual(["lh-relaxed"]);
  });

  it("applies no lh-* class for an undefined hint (back-compat default)", () => {
    document.documentElement.classList.add("lh-relaxed");
    applyLineHeightHintToDocument(undefined, document);
    const present = LINE_HEIGHT_HINT_CLASSES.filter((c) =>
      document.documentElement.classList.contains(c),
    );
    expect(present).toEqual([]);
  });

  it("applies to a ShadowRoot's host element", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    applyLineHeightHintToDocument("default", shadow);
    expect(host.classList.contains("lh-default")).toBe(true);
    host.remove();
  });
});

describe("line-height-hint — tokens.css conformance floor", () => {
  // jsdom cannot resolve cascaded custom-property values, but the
  // contract is assertable from the stylesheet source: every band binds
  // --nd-body-line-height >= 1.5, and body reads --nd-body-line-height so
  // focus-mode's 1.45 (which only re-binds --nd-line-height) cannot drop
  // a hinted body paragraph below the floor.
  const tokensCss = readFileSync(
    resolve(process.cwd(), "src/styles/tokens.css"),
    "utf8",
  );

  it("declares --nd-body-line-height for compact at the 1.5 floor", () => {
    expect(tokensCss).toMatch(
      /\.lh-compact[^{]*{[^}]*--nd-body-line-height:\s*1\.5\b/,
    );
  });

  it("declares --nd-body-line-height for default at >= 1.5", () => {
    const m = tokensCss.match(
      /\.lh-default[^{]*{[^}]*--nd-body-line-height:\s*(1\.\d+)/,
    );
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1.5);
  });

  it("declares --nd-body-line-height for relaxed within 1.65–1.8", () => {
    const m = tokensCss.match(
      /\.lh-relaxed[^{]*{[^}]*--nd-body-line-height:\s*(1\.\d+)/,
    );
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1.65);
    expect(Number(m![1])).toBeLessThanOrEqual(1.8);
  });

  it("the shadow-host (:host) variants also bind --nd-body-line-height for the island", () => {
    expect(tokensCss).toMatch(
      /:host\(\.lh-compact\)[^{]*{[^}]*--nd-body-line-height:\s*1\.5\b/,
    );
  });
});

describe("line-height-hint — popup + tab body bind the hinted variable", () => {
  // Body paragraphs must read --nd-body-line-height with a fallback to
  // --nd-line-height. The fallback keeps an un-hinted body byte-identical
  // to today (focus-mode 1.45 still applies when NO hint is set); a set
  // hint binds --nd-body-line-height >= 1.5, so focus-mode cannot pull a
  // hinted body paragraph below the WCAG floor.
  const popupCss = readFileSync(
    resolve(process.cwd(), "entrypoints/popup/styles.css"),
    "utf8",
  );
  const tabCss = readFileSync(
    resolve(process.cwd(), "entrypoints/tab/styles.css"),
    "utf8",
  );

  it("popup body line-height falls back to --nd-line-height when no hint set", () => {
    expect(popupCss).toMatch(
      /body\s*{[^}]*line-height:\s*var\(\s*--nd-body-line-height\s*,\s*var\(--nd-line-height\)\s*\)/,
    );
  });

  it("tab body line-height falls back to --nd-line-height when no hint set", () => {
    expect(tabCss).toMatch(
      /body\s*{[^}]*line-height:\s*var\(\s*--nd-body-line-height\s*,\s*var\(--nd-line-height\)\s*\)/,
    );
  });
});
