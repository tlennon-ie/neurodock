/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * mountIsland.ts
 *
 * Mount a React island inside a Shadow Root so the host site's CSS does not
 * bleed into the extension UI and vice versa.
 *
 * The "island" is a single rooted container per page; we never mount more
 * than one per content script context.
 */
import { createRoot, type Root } from "react-dom/client";

export interface Island {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly root: Root;
  readonly destroy: () => void;
}

export function mountIsland(hostId: string, doc: Document = document): Island {
  const existing = doc.getElementById(hostId);
  if (existing && existing.shadowRoot) {
    const containerNode = existing.shadowRoot.querySelector(
      "div[data-neurodock-root]",
    );
    if (containerNode instanceof HTMLElement) {
      const root = createRoot(containerNode);
      return {
        host: existing,
        shadow: existing.shadowRoot,
        root,
        destroy: () => {
          root.unmount();
          existing.remove();
        },
      };
    }
  }

  const host = doc.createElement("div");
  host.id = hostId;
  host.setAttribute("data-neurodock", "true");
  // Position fixed but offscreen until the floating button positions itself.
  host.style.cssText =
    "position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;";
  doc.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleHost = doc.createElement("style");
  // Theme v2 — resolve the bundled webfonts to their extension-origin
  // URLs so the in-page island matches the popup / tab typography
  // instead of falling back to system-ui inside the host page.
  // `chrome.runtime.getURL` is content-script safe and lives behind a
  // try / catch so non-extension contexts (tests, dev harnesses) fall
  // back to a relative URL string.
  const fontUrl = (file: string): string => {
    try {
      const g = globalThis as unknown as {
        chrome?: { runtime?: { getURL?: (p: string) => string } };
      };
      const getURL = g.chrome?.runtime?.getURL;
      if (typeof getURL === "function") return getURL(`fonts/${file}`);
    } catch {
      /* fall through to relative URL */
    }
    return `/fonts/${file}`;
  };
  // Minimal in-shadow reset. Tailwind classes do not work inside the shadow
  // unless we explicitly inject them; v0.0.1 keeps the in-page island
  // styling inline / minimal. The popup uses Tailwind; the in-page island
  // uses a small handcrafted stylesheet.
  // The shadow root cannot reach the popup's @import "tokens.css"
  // declarations because `:host { all: initial; }` severs all inherited
  // custom properties. We re-declare the same OKLCH coordinates here so
  // the in-page island matches the popup and tab surfaces exactly. The
  // values mirror `src/styles/tokens.css`.
  //
  // Hairlines only — no decorative shadows, no gradients, no radii
  // beyond a 2px touch to soften the hard rectangle. Motion is disabled.
  styleHost.textContent = `
    @font-face {
      font-family: "Atkinson Hyperlegible";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("${fontUrl("atkinson-hyperlegible-400.woff2")}") format("woff2");
    }
    @font-face {
      font-family: "Atkinson Hyperlegible";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${fontUrl("atkinson-hyperlegible-700.woff2")}") format("woff2");
    }
    @font-face {
      font-family: "Lexend Variable";
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url("${fontUrl(
        "lexend-variable.woff2",
      )}") format("woff2-variations");
    }
    @font-face {
      font-family: "OpenDyslexic";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("${fontUrl("opendyslexic-400.woff2")}") format("woff2");
    }
    @font-face {
      font-family: "OpenDyslexic";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${fontUrl("opendyslexic-700.woff2")}") format("woff2");
    }
    @font-face {
      font-family: "Comic Neue";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("${fontUrl("comic-neue-400.woff2")}") format("woff2");
    }
    @font-face {
      font-family: "Comic Neue";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${fontUrl("comic-neue-700.woff2")}") format("woff2");
    }
    :host { all: initial; }
    :host {
      /* Per-font metric compensation. This sheet declares text sizes in
         px (not rem), so the root-rem trick in tokens.css cannot reach
         it. Every font-size below multiplies by this scale instead.
         Keep the factors in sync with src/styles/tokens.css. */
      --nd-island-font-scale: 1;
      --nd-font-body: "Atkinson Hyperlegible", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --nd-font-heading: "Lexend Variable", "Lexend", "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif;
      --nd-color-bg: oklch(98% 0.005 95);
      --nd-color-bg-nav: oklch(97% 0.005 95);
      --nd-color-fg: oklch(22% 0.01 250);
      --nd-color-fg-muted: oklch(40% 0.01 250);
      --nd-color-hairline: oklch(88% 0.005 95);
      --nd-color-accent: oklch(45% 0.05 250);
      --nd-color-accent-high: oklch(35% 0.05 250);
      --nd-color-warn-fg: oklch(40% 0.08 70);
      --nd-color-warn-border: oklch(80% 0.06 70);
      --nd-color-warn-bg: oklch(95% 0.03 70);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --nd-color-bg: oklch(18% 0.005 250);
        --nd-color-bg-nav: oklch(20% 0.005 250);
        --nd-color-fg: oklch(92% 0.01 95);
        --nd-color-fg-muted: oklch(72% 0.01 95);
        --nd-color-hairline: oklch(28% 0.005 250);
        --nd-color-accent: oklch(72% 0.06 250);
        --nd-color-accent-high: oklch(85% 0.04 250);
        --nd-color-warn-fg: oklch(82% 0.10 70);
        --nd-color-warn-border: oklch(45% 0.08 70);
        --nd-color-warn-bg: oklch(24% 0.04 70);
      }
      /* User forced light inside a dark OS — re-apply light palette. */
      :host(.nd-theme-light) {
        --nd-color-bg: oklch(98% 0.005 95);
        --nd-color-bg-nav: oklch(97% 0.005 95);
        --nd-color-fg: oklch(22% 0.01 250);
        --nd-color-fg-muted: oklch(40% 0.01 250);
        --nd-color-hairline: oklch(88% 0.005 95);
        --nd-color-accent: oklch(45% 0.05 250);
        --nd-color-accent-high: oklch(35% 0.05 250);
        --nd-color-warn-fg: oklch(40% 0.08 70);
        --nd-color-warn-border: oklch(80% 0.06 70);
        --nd-color-warn-bg: oklch(95% 0.03 70);
      }
    }
    /* User forced dark inside a light OS — apply dark palette directly. */
    :host(.nd-theme-dark) {
      --nd-color-bg: oklch(18% 0.005 250);
      --nd-color-bg-nav: oklch(20% 0.005 250);
      --nd-color-fg: oklch(92% 0.01 95);
      --nd-color-fg-muted: oklch(72% 0.01 95);
      --nd-color-hairline: oklch(28% 0.005 250);
      --nd-color-accent: oklch(72% 0.06 250);
      --nd-color-accent-high: oklch(85% 0.04 250);
      --nd-color-warn-fg: oklch(82% 0.10 70);
      --nd-color-warn-border: oklch(45% 0.08 70);
      --nd-color-warn-bg: oklch(24% 0.04 70);
    }
    /* RFC A3 — high-contrast theme. Activated by setting the
       \`nd-high-contrast\` class on the shadow-root host element. */
    :host(.nd-high-contrast) {
      --nd-color-bg: oklch(100% 0 0);
      --nd-color-bg-nav: oklch(100% 0 0);
      --nd-color-fg: oklch(0% 0 0);
      --nd-color-fg-muted: oklch(20% 0 0);
      --nd-color-hairline: oklch(0% 0 0);
      --nd-color-accent: oklch(0% 0 0);
      --nd-color-accent-high: oklch(0% 0 0);
      --nd-focus-ring-width: 3px;
    }
    @media (prefers-color-scheme: dark) {
      :host(.nd-high-contrast) {
        --nd-color-bg: oklch(0% 0 0);
        --nd-color-bg-nav: oklch(0% 0 0);
        --nd-color-fg: oklch(100% 0 0);
        --nd-color-fg-muted: oklch(85% 0 0);
        --nd-color-hairline: oklch(100% 0 0);
        --nd-color-accent: oklch(100% 0 0);
        --nd-color-accent-high: oklch(100% 0 0);
      }
    }
    /* RFC A3 — focus mode. Tighter line-height + hide the cloud-mode
       banner inside the island. */
    :host(.nd-focus-mode) .neurodock-panel {
      line-height: 1.45;
    }
    :host(.nd-focus-mode) .neurodock-banner {
      display: none;
    }
    /* A6 — reader-font switcher. Re-bind font stacks per selected font.
       Mirrors src/styles/tokens.css :host(.font-*) blocks exactly. */
    :host(.font-atkinson) {
      --nd-font-body: "Atkinson Hyperlegible", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --nd-font-heading: "Lexend Variable", "Lexend", "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif;
    }
    :host(.font-lexend) {
      --nd-font-body: "Lexend Variable", "Lexend", "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif;
      --nd-font-heading: "Lexend Variable", "Lexend", "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif;
    }
    :host(.font-opendyslexic) {
      --nd-island-font-scale: 0.85;
      --nd-font-body: "OpenDyslexic", "Atkinson Hyperlegible", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --nd-font-heading: "OpenDyslexic", "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif;
    }
    :host(.font-comic) {
      --nd-island-font-scale: 0.95;
      --nd-font-body: "Comic Neue", "Atkinson Hyperlegible", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --nd-font-heading: "Comic Neue", "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif;
    }
    :host(.font-system) {
      --nd-font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --nd-font-heading: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .neurodock-button {
      pointer-events: auto;
      font-family: var(--nd-font-body);
      font-size: calc(14px * var(--nd-island-font-scale, 1));
      line-height: 1.65;
      padding: 6px 10px;
      border: 1px solid var(--nd-color-hairline);
      background: var(--nd-color-bg);
      color: var(--nd-color-fg);
      cursor: pointer;
    }
    .neurodock-button:focus-visible {
      outline: var(--nd-focus-ring-width, 2px) solid var(--nd-color-accent);
      outline-offset: 2px;
    }
    .neurodock-panel {
      pointer-events: auto;
      font-family: var(--nd-font-body);
      font-size: calc(14px * var(--nd-island-font-scale, 1));
      line-height: 1.5;
      width: 420px;
      max-width: 92vw;
      max-height: 80vh;
      overflow-y: auto;
      overflow-wrap: anywhere;
      padding: 12px 14px 14px 14px;
      border: 1px solid var(--nd-color-hairline);
      background: var(--nd-color-bg);
      color: var(--nd-color-fg);
    }
    .neurodock-panel h3 {
      font-family: var(--nd-font-heading);
    }
    .neurodock-banner {
      margin-bottom: 8px;
      padding: 6px 8px;
      border: 1px solid var(--nd-color-warn-border);
      background: var(--nd-color-warn-bg);
      color: var(--nd-color-warn-fg);
      font-size: calc(14px * var(--nd-island-font-scale, 1));
    }
    /* RFC B3: pacing-copilot toast. Same hairline + warn tokens as the
       cloud banner so it sits inside the existing visual language. No
       slide-in animation by default — opted in only under
       prefers-reduced-motion: no-preference. */
    .neurodock-toast {
      pointer-events: auto;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border: 1px solid var(--nd-color-hairline);
      background: var(--nd-color-bg);
      color: var(--nd-color-fg);
      font-family: var(--nd-font-body);
      font-size: calc(14px * var(--nd-island-font-scale, 1));
      line-height: 1.5;
    }
    .neurodock-toast-body { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .neurodock-toast-title { font-weight: 600; font-family: var(--nd-font-heading); }
    .neurodock-toast-text { color: var(--nd-color-fg-muted); }
    .neurodock-toast-dismiss { align-self: flex-start; padding: 4px 8px; font-size: calc(13px * var(--nd-island-font-scale, 1)); }
    @media (prefers-reduced-motion: no-preference) {
      .neurodock-toast {
        opacity: 0;
        animation: nd-toast-fade-in 120ms ease-out forwards;
      }
      @keyframes nd-toast-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    }
  `;
  shadow.appendChild(styleHost);

  const container = doc.createElement("div");
  container.setAttribute("data-neurodock-root", "true");
  shadow.appendChild(container);

  const root = createRoot(container);
  return {
    host,
    shadow,
    root,
    destroy: () => {
      root.unmount();
      host.remove();
    },
  };
}
