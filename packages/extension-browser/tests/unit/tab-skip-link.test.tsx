/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Unit test for the tab-view skip-to-content link (RFC A3).
 */
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { TabApp } from "../../entrypoints/tab/App.js";

async function clearChromeStorage(): Promise<void> {
  const c = (
    globalThis as unknown as {
      chrome: { storage: { local: { clear: () => Promise<void> } } };
    }
  ).chrome;
  await c.storage.local.clear();
}

describe("Tab view — skip-to-content link (RFC A3)", () => {
  beforeEach(async () => {
    await clearChromeStorage();
    document.documentElement.className = "";
  });

  it("renders the skip link as the first focusable element", async () => {
    render(<TabApp />);
    const link = await screen.findByTestId("tab-skip-link");
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("#nd-tab-main");
    expect(link.textContent).toBe("Skip to main content");
  });

  it("targets an element with id nd-tab-main inside the shell", async () => {
    render(<TabApp />);
    await screen.findByTestId("tab-skip-link");
    const target = document.getElementById("nd-tab-main");
    expect(target).not.toBeNull();
    expect(target?.getAttribute("tabindex")).toBe("-1");
  });

  it("carries the nd-skip-link class so the visually-hidden CSS resolves", async () => {
    render(<TabApp />);
    const link = await screen.findByTestId("tab-skip-link");
    expect(link.className).toContain("nd-skip-link");
  });

  it("is positioned BEFORE the AppShell wrapper in DOM order", async () => {
    render(<TabApp />);
    const link = await screen.findByTestId("tab-skip-link");
    const shell = await screen.findByTestId("app-shell-tab");
    // documentPosition: 4 = FOLLOWING (shell follows link).
    expect(
      link.compareDocumentPosition(shell) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});
