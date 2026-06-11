/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Pre-paint reader-font application for extension pages (popup + tab).
 * Loaded as a CLASSIC (non-module) script from <head>, so it is
 * parser-blocking and runs before <body> renders — no flash of unhinted
 * text. MUST be an external file: MV3 extension pages enforce
 * script-src 'self' and block ALL inline scripts at runtime.
 * Keep in sync with src/lib/reader-font.ts.
 */
(function () {
  var KEY = "neurodockFont";
  var ALLOWED = {
    atkinson: 1,
    lexend: 1,
    opendyslexic: 1,
    comic: 1,
    system: 1,
  };
  var stored;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {
    stored = null;
  }
  var choice = stored && ALLOWED[stored] ? stored : "atkinson";
  var root = document.documentElement;
  root.classList.remove(
    "font-atkinson",
    "font-lexend",
    "font-opendyslexic",
    "font-comic",
    "font-system",
  );
  root.classList.add("font-" + choice);
})();
