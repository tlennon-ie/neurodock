/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import React, { useState } from "react";
import {
  type ReaderFont,
  applyReaderFontToDocument,
  loadReaderFont,
  saveReaderFont,
} from "../lib/reader-font.js";

const OPTIONS: ReadonlyArray<{ value: ReaderFont; label: string }> = [
  { value: "atkinson", label: "Atkinson Hyperlegible" },
  { value: "lexend", label: "Lexend (ADHD)" },
  { value: "opendyslexic", label: "OpenDyslexic" },
  { value: "comic", label: "Comic Neue" },
  { value: "system", label: "System default" },
];

interface ReaderFontSwitcherProps {
  /** Optional callback so callers (onboarding) can react to a change. */
  readonly onChange?: (font: ReaderFont) => void;
}

export function ReaderFontSwitcher({ onChange }: ReaderFontSwitcherProps) {
  const [font, setFont] = useState<ReaderFont>(() => loadReaderFont());

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ReaderFont;
    setFont(next);
    saveReaderFont(next);
    applyReaderFontToDocument(next);
    onChange?.(next);
  }

  return (
    <label className="nd-font-switcher" aria-label="Reading font">
      <span className="sr-only">Reading font</span>
      <select
        data-testid="reader-font-select"
        value={font}
        onChange={handleChange}
        autoComplete="off"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
