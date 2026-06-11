/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NeuroDockHeader } from "../../src/components/NeuroDockHeader.js";

describe("NeuroDockHeader", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("renders the wordmark, font switcher, and theme toggle", () => {
    render(<NeuroDockHeader />);
    expect(screen.getByTestId("nd-header-wordmark")).toHaveTextContent(
      "NeuroDock",
    );
    expect(screen.getByTestId("reader-font-select")).toBeInTheDocument();
    expect(screen.getByTestId("theme-mode-toggle")).toBeInTheDocument();
  });

  it("renders an optional full-view button when onOpenSettings is provided", () => {
    let opened = false;
    render(<NeuroDockHeader onOpenSettings={() => (opened = true)} />);
    screen.getByTestId("nd-header-settings").click();
    expect(opened).toBe(true);
  });

  it("labels the full-view button clearly and uses an expand icon", () => {
    render(<NeuroDockHeader onOpenSettings={() => {}} />);
    const btn = screen.getByTestId("nd-header-settings");
    // Clear accessible name + hover tooltip ("the icon isn't clear" fix).
    expect(btn).toHaveAttribute("aria-label", "Open full view");
    expect(btn).toHaveAttribute("title", "Open full view");
    // The glyph is an SVG expand icon, hidden from the a11y tree, not text.
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(btn.textContent).not.toContain("⚙");
  });

  it("omits the full-view button when onOpenSettings is not provided", () => {
    render(<NeuroDockHeader />);
    expect(screen.queryByTestId("nd-header-settings")).not.toBeInTheDocument();
  });
});
