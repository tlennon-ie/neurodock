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

  it("renders an optional gear when onOpenSettings is provided", () => {
    let opened = false;
    render(<NeuroDockHeader onOpenSettings={() => (opened = true)} />);
    screen.getByTestId("nd-header-settings").click();
    expect(opened).toBe(true);
  });

  it("omits the gear when onOpenSettings is not provided", () => {
    render(<NeuroDockHeader />);
    expect(screen.queryByTestId("nd-header-settings")).not.toBeInTheDocument();
  });
});
