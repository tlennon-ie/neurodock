/**
 * mountIsland.ts
 *
 * Mount a React island inside a Shadow Root so the host site's CSS does not
 * bleed into the extension UI and vice versa.
 *
 * The "island" is a single rooted container per page; we never mount more
 * than one per content script context.
 */
import React from "react";
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
    :host { all: initial; }
    :host {
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
    .neurodock-button {
      pointer-events: auto;
      font-family: "Atkinson Hyperlegible", system-ui, sans-serif;
      font-size: 14px;
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
      font-family: "Atkinson Hyperlegible", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      width: 420px;
      max-width: 92vw;
      max-height: 80vh;
      overflow-y: auto;
      padding: 12px 14px 14px 14px;
      border: 1px solid var(--nd-color-hairline);
      background: var(--nd-color-bg);
      color: var(--nd-color-fg);
    }
    .neurodock-panel h3 {
      font-family: "Lexend Variable", "Lexend", inherit;
    }
    .neurodock-banner {
      margin-bottom: 8px;
      padding: 6px 8px;
      border: 1px solid var(--nd-color-warn-border);
      background: var(--nd-color-warn-bg);
      color: var(--nd-color-warn-fg);
      font-size: 14px;
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
