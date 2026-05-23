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
  styleHost.textContent = `
    :host { all: initial; }
    .neurodock-button {
      pointer-events: auto;
      font-family: "Atkinson Hyperlegible", system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.65;
      padding: 6px 10px;
      border: 1px solid #56564f;
      background: #fafaf9;
      color: #161615;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .neurodock-button:focus {
      outline: 2px solid #4a4a47;
      outline-offset: 2px;
    }
    @media (prefers-color-scheme: dark) {
      .neurodock-button {
        background: #161615;
        color: #fafaf9;
        border-color: #cfcfcb;
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .neurodock-button { transition: none; }
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
      border: 1px solid #56564f;
      background: #fafaf9;
      color: #161615;
      box-shadow: 0 6px 18px rgba(0,0,0,0.22);
      border-radius: 4px;
    }
    .neurodock-panel h3 {
      font-family: inherit;
    }
    @media (prefers-color-scheme: dark) {
      .neurodock-panel {
        background: #262625;
        color: #fafaf9;
        border-color: #cfcfcb;
      }
    }
    .neurodock-banner {
      margin-bottom: 8px;
      padding: 6px 8px;
      border: 1px solid #7c5b1a;
      background: rgba(124,91,26,0.08);
      font-size: 12px;
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
