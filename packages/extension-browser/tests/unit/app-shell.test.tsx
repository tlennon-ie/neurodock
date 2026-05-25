/**
 * @license AGPL-3.0-or-later
 *
 * AppShell — renders both `mode="popup"` (compact stack) and
 * `mode="tab"` (wide rail layout) without changing the children, and
 * exposes the same data via simple slot props.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { AppShell } from "../../src/components/AppShell.js";

describe("AppShell", () => {
  it("renders popup mode with a compact stack", () => {
    render(
      <AppShell
        mode="popup"
        header={<h1>NeuroDock</h1>}
        nav={<nav data-testid="nav">nav</nav>}
      >
        <div data-testid="main">main content</div>
      </AppShell>,
    );
    const shell = screen.getByTestId("app-shell-popup");
    expect(shell).toBeInTheDocument();
    expect(shell.getAttribute("data-shell-mode")).toBe("popup");
    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("main")).toBeInTheDocument();
  });

  it("renders tab mode with a wide layout and the same child content", () => {
    render(
      <AppShell
        mode="tab"
        header={<h1>NeuroDock</h1>}
        nav={<nav data-testid="nav">nav</nav>}
      >
        <div data-testid="main">main content</div>
      </AppShell>,
    );
    const shell = screen.getByTestId("app-shell-tab");
    expect(shell).toBeInTheDocument();
    expect(shell.getAttribute("data-shell-mode")).toBe("tab");
    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("main")).toBeInTheDocument();
  });

  it("does not render the nav slot when no nav is provided", () => {
    render(
      <AppShell mode="tab" header={<h1>NeuroDock</h1>}>
        <div data-testid="main">main</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("nav")).toBeNull();
    expect(screen.getByTestId("main")).toBeInTheDocument();
  });

  it("renders a banner slot when provided", () => {
    render(
      <AppShell
        mode="popup"
        header={<h1>NeuroDock</h1>}
        banner={<div data-testid="banner">cloud mode active</div>}
      >
        <div>main</div>
      </AppShell>,
    );
    expect(screen.getByTestId("banner")).toBeInTheDocument();
  });
});
