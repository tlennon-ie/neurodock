/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * MV3 extension pages enforce script-src 'self' and block ALL inline
 * scripts at runtime (hashes/nonces are not honored). The pre-paint
 * reader-font logic must therefore live in an external classic script.
 * Guards: (1) no inline <script> bodies in entrypoint HTML, (2) the
 * external prepaint script is referenced, (3) prepaint.js stays in sync
 * with the reader-font contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const popupHtml = readFileSync(
  resolve(root, "entrypoints/popup/index.html"),
  "utf8",
);
const tabHtml = readFileSync(
  resolve(root, "entrypoints/tab/index.html"),
  "utf8",
);
const prepaint = readFileSync(resolve(root, "public/prepaint.js"), "utf8");

describe("prepaint csp contract", () => {
  it.each([
    ["popup", popupHtml],
    ["tab", tabHtml],
  ])("%s html has no inline script bodies", (_name, html) => {
    // Any <script> tag with content between the tags is an inline script.
    const inline =
      html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) ?? [];
    const nonEmpty = inline.filter(
      (s) => s.replace(/<\/?script[^>]*>/g, "").trim() !== "",
    );
    expect(nonEmpty).toEqual([]);
  });

  it.each([
    ["popup", popupHtml],
    ["tab", tabHtml],
  ])("%s html references the external prepaint script", (_name, html) => {
    expect(html).toMatch(/<script\s+src="\/prepaint\.js"><\/script>/);
  });

  it("prepaint.js carries the reader-font contract", () => {
    expect(prepaint).toContain('"neurodockFont"');
    for (const f of ["atkinson", "lexend", "opendyslexic", "comic", "system"]) {
      expect(prepaint).toContain(f);
    }
  });
});
