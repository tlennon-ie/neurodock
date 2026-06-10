/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReaderFontSwitcher } from "../../src/components/ReaderFontSwitcher.js";
import { READER_FONT_STORAGE_KEY } from "../../src/lib/reader-font.js";

describe("ReaderFontSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("renders all five options with the docs labels", () => {
    render(<ReaderFontSwitcher />);
    const select = screen.getByTestId(
      "reader-font-select",
    ) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual([
      "Atkinson Hyperlegible",
      "Lexend (ADHD)",
      "OpenDyslexic",
      "Comic Neue",
      "System default",
    ]);
  });

  it("reflects the stored value on mount", () => {
    localStorage.setItem(READER_FONT_STORAGE_KEY, "lexend");
    render(<ReaderFontSwitcher />);
    const select = screen.getByTestId(
      "reader-font-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("lexend");
  });

  it("persists the choice and applies the class on change", () => {
    render(<ReaderFontSwitcher />);
    const select = screen.getByTestId(
      "reader-font-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "opendyslexic" } });
    expect(localStorage.getItem(READER_FONT_STORAGE_KEY)).toBe("opendyslexic");
    expect(
      document.documentElement.classList.contains("font-opendyslexic"),
    ).toBe(true);
  });
});
