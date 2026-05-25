/**
 * In-page translation progress indicator.
 *
 * Why this exists (0.0.31):
 *   Pre-0.0.31 the only feedback while a translation was running was the
 *   toolbar action badge ("working / success / mock / error") plus a
 *   fallback OS notification. Neither felt like progress on the page
 *   where the user just right-clicked. This module renders a small
 *   Shadow-DOM badge anchored to the target (image rect or cursor
 *   position) that spins while the translation is in flight, then
 *   morphs into a checkmark / x-mark for ~1.5–2s before fading out.
 *
 * Design rules (from the agent operating manual):
 *   - Shadow DOM only — host-page CSS never touches the indicator.
 *   - `prefers-reduced-motion`: no spin, no fade transforms; show a
 *     static "Translating…" badge that stays visible until completion.
 *   - `aria-live="polite"` region announces "Translating…", "Translation
 *     ready", or "Translation failed".
 *   - One indicator per concurrent translation. Multiple in flight =>
 *     multiple indicators, each owned by its own handle.
 *   - Indicator self-detaches on completion AND on `pagehide` so it
 *     never lingers across SPA navigations.
 *   - No new dependencies, no host-page style injection, no emojis.
 *
 * Public API:
 *   const handle = attachIndicator({ kind: "image", element: imgEl });
 *   await translate();
 *   handle.success();          // morph to check; auto-detach after ~1.5s
 *   handle.failure("err msg"); // morph to cross; auto-detach after ~2s
 *   // OR: handle.detach() to remove immediately.
 */

export type IndicatorAnchor =
  | {
      readonly kind: "image";
      /** The live <img> the indicator anchors to. */
      readonly element: HTMLImageElement;
    }
  | {
      readonly kind: "cursor";
      /** Viewport coords (clientX/clientY). */
      readonly x: number;
      readonly y: number;
    };

export interface IndicatorHandle {
  /** Morph to the success (check) glyph and auto-detach after ~1.5s. */
  readonly success: () => void;
  /** Morph to the failure (x) glyph and auto-detach after ~2s. */
  readonly failure: (message?: string) => void;
  /** Remove the indicator immediately. Idempotent. */
  readonly detach: () => void;
  /** True once the handle has been detached. */
  readonly isDetached: () => boolean;
}

interface IndicatorOptions {
  readonly successHoldMs?: number;
  readonly failureHoldMs?: number;
  readonly fadeOutMs?: number;
  readonly reducedMotion?: boolean;
  readonly doc?: Document;
}

const DEFAULT_SUCCESS_HOLD_MS = 1500;
const DEFAULT_FAILURE_HOLD_MS = 2000;
const DEFAULT_FADE_OUT_MS = 400;

const HOST_ATTR = "data-neurodock-indicator";

/**
 * Mount a fresh indicator anchored to `anchor`. The returned handle owns
 * its own Shadow-DOM host element; callers MUST eventually call
 * `success()`, `failure()`, or `detach()` to clean up.
 */
export function attachIndicator(
  anchor: IndicatorAnchor,
  options: IndicatorOptions = {},
): IndicatorHandle {
  const doc = options.doc ?? document;
  const reducedMotion =
    options.reducedMotion ?? detectReducedMotion(doc.defaultView ?? window);
  const successHoldMs = options.successHoldMs ?? DEFAULT_SUCCESS_HOLD_MS;
  const failureHoldMs = options.failureHoldMs ?? DEFAULT_FAILURE_HOLD_MS;
  const fadeOutMs = options.fadeOutMs ?? DEFAULT_FADE_OUT_MS;

  const host = doc.createElement("div");
  host.setAttribute(HOST_ATTR, "true");
  // Fixed positioning so we can place the indicator using viewport
  // coords. `pointer-events: none` keeps it from intercepting clicks on
  // the host page (the user can keep interacting with the image they
  // just right-clicked).
  host.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "width: 0",
    "height: 0",
    "pointer-events: none",
    "z-index: 2147483647",
  ].join("; ");
  doc.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = doc.createElement("style");
  styleEl.textContent = buildStyles(reducedMotion, fadeOutMs);
  shadow.appendChild(styleEl);

  const container = doc.createElement("div");
  container.setAttribute("data-state", "spinning");
  container.setAttribute("class", "nd-indicator");
  shadow.appendChild(container);

  const liveRegion = doc.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("class", "nd-sr");
  liveRegion.textContent = reducedMotion
    ? "Translating, please wait."
    : "Translating…";
  container.appendChild(liveRegion);

  const glyph = doc.createElement("div");
  glyph.setAttribute("class", "nd-glyph");
  glyph.setAttribute("aria-hidden", "true");
  glyph.innerHTML = reducedMotion
    ? buildReducedMotionLabel()
    : buildSpinnerSvg();
  container.appendChild(glyph);

  positionHost(host, anchor);

  // Reposition on scroll / resize so an image anchor keeps tracking the
  // <img> rect. We use passive listeners and capture: false because we
  // only need to react to viewport-level scrolls; the cost is
  // negligible.
  let positionFrame: number | null = null;
  const schedulePosition = (): void => {
    if (positionFrame !== null) return;
    const win = doc.defaultView ?? window;
    positionFrame = win.requestAnimationFrame(() => {
      positionFrame = null;
      positionHost(host, anchor);
    });
  };
  const win = doc.defaultView ?? window;
  win.addEventListener("scroll", schedulePosition, {
    passive: true,
    capture: true,
  });
  win.addEventListener("resize", schedulePosition, { passive: true });

  // Self-detach on page navigation so stale indicators never leak.
  const onPageHide = (): void => detach();
  win.addEventListener("pagehide", onPageHide, { once: true });

  let detached = false;
  let detachTimer: number | null = null;

  const detach = (): void => {
    if (detached) return;
    detached = true;
    if (detachTimer !== null) {
      win.clearTimeout(detachTimer);
      detachTimer = null;
    }
    if (positionFrame !== null) {
      win.cancelAnimationFrame(positionFrame);
      positionFrame = null;
    }
    win.removeEventListener("scroll", schedulePosition, { capture: true });
    win.removeEventListener("resize", schedulePosition);
    win.removeEventListener("pagehide", onPageHide);
    try {
      host.remove();
    } catch {
      // Host was already removed (e.g. document body cleared during
      // navigation). Nothing more to do.
    }
  };

  const morph = (
    state: "success" | "failure",
    holdMs: number,
    message: string,
  ): void => {
    if (detached) return;
    container.setAttribute("data-state", state);
    glyph.innerHTML = state === "success" ? buildCheckSvg() : buildCrossSvg();
    liveRegion.textContent = message;
    // Hold the visible state, then fade out, then detach.
    detachTimer = win.setTimeout(() => {
      detachTimer = null;
      container.setAttribute("data-state", `${state}-fade`);
      detachTimer = win.setTimeout(() => {
        detachTimer = null;
        detach();
      }, fadeOutMs);
    }, holdMs);
  };

  return {
    success: () => morph("success", successHoldMs, "Translation ready."),
    failure: (msg) =>
      morph(
        "failure",
        failureHoldMs,
        msg ? `Translation failed: ${msg}` : "Translation failed.",
      ),
    detach,
    isDetached: () => detached,
  };
}

/**
 * Compute the on-screen position for the indicator host given an anchor.
 * Exported for unit tests.
 *
 *   - image  → top-right corner of the image, inset 4px.
 *   - cursor → 12px below-right of the cursor.
 *
 * Returns viewport-coordinate (top, left) for the 32×32 indicator
 * bounding box. When the computed position would clip outside the
 * viewport we nudge it inward by the same inset.
 */
export function computeIndicatorPosition(
  anchor: IndicatorAnchor,
  viewport: { readonly innerWidth: number; readonly innerHeight: number },
): { readonly top: number; readonly left: number } {
  const size = 32;
  if (anchor.kind === "image") {
    const rect = anchor.element.getBoundingClientRect();
    // Anchor to the image's top-right corner, inset 4px so the glyph
    // sits on top of the image and not floating outside it.
    const inset = 4;
    let left = rect.right - size - inset;
    let top = rect.top + inset;
    // If the image is too small for a 32px inset, centre instead.
    if (rect.width < size + inset * 2) {
      left = rect.left + (rect.width - size) / 2;
    }
    if (rect.height < size + inset * 2) {
      top = rect.top + (rect.height - size) / 2;
    }
    return clampToViewport({ top, left }, size, viewport);
  }
  // cursor anchor: 12px below-right of the cursor.
  const offset = 12;
  return clampToViewport(
    { top: anchor.y + offset, left: anchor.x + offset },
    size,
    viewport,
  );
}

function clampToViewport(
  pos: { readonly top: number; readonly left: number },
  size: number,
  viewport: { readonly innerWidth: number; readonly innerHeight: number },
): { readonly top: number; readonly left: number } {
  const left = Math.max(4, Math.min(pos.left, viewport.innerWidth - size - 4));
  const top = Math.max(4, Math.min(pos.top, viewport.innerHeight - size - 4));
  return { top, left };
}

function positionHost(host: HTMLElement, anchor: IndicatorAnchor): void {
  const win = host.ownerDocument?.defaultView ?? window;
  const { top, left } = computeIndicatorPosition(anchor, {
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
  });
  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
}

function detectReducedMotion(win: Window): boolean {
  try {
    return (
      win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
    );
  } catch {
    return false;
  }
}

/**
 * Locate the live `<img>` element for an `image:<imageUrl>` indicator
 * anchor. Mirrors the matcher in imageSnapshot.ts — `currentSrc` first
 * (post-srcset resolution), then `src`.
 */
export function findImageElementByUrl(
  imageUrl: string,
  doc: Document = document,
): HTMLImageElement | null {
  const imgs = Array.from(doc.querySelectorAll("img"));
  for (const img of imgs) {
    if (img.currentSrc === imageUrl) return img;
  }
  for (const img of imgs) {
    if (img.src === imageUrl) return img;
  }
  return null;
}

// ─── Styles + SVG glyphs ─────────────────────────────────────────────────────

function buildStyles(reducedMotion: boolean, fadeOutMs: number): string {
  // Colours mirror the existing in-page panel palette
  // (mountIsland.ts) so we don't introduce a new theme surface.
  // Dark scheme picks the same #fafaf9 / #262625 pair the panel uses.
  return `
    :host { all: initial; }
    .nd-indicator {
      position: absolute;
      top: 0;
      left: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(250, 250, 249, 0.92);
      border: 1px solid #56564f;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #161615;
      font-family: "Atkinson Hyperlegible", system-ui, sans-serif;
      font-size: 11px;
      line-height: 1;
      opacity: 1;
      transition: opacity ${fadeOutMs}ms ease-out;
    }
    @media (prefers-color-scheme: dark) {
      .nd-indicator {
        background: rgba(38, 38, 37, 0.92);
        border-color: #cfcfcb;
        color: #fafaf9;
      }
    }
    .nd-glyph {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nd-glyph svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .nd-indicator[data-state="success"] {
      background: rgba(46, 110, 50, 0.95);
      border-color: rgba(46, 110, 50, 0.95);
      color: #ffffff;
    }
    .nd-indicator[data-state="failure"] {
      background: rgba(155, 35, 35, 0.95);
      border-color: rgba(155, 35, 35, 0.95);
      color: #ffffff;
    }
    .nd-indicator[data-state="success-fade"],
    .nd-indicator[data-state="failure-fade"] {
      opacity: 0;
    }
    .nd-sr {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .nd-reduced-label {
      font-size: 10px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    ${reducedMotion ? "" : buildSpinnerKeyframes()}
  `;
}

function buildSpinnerKeyframes(): string {
  return `
    @keyframes nd-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .nd-indicator[data-state="spinning"] .nd-glyph svg {
      animation: nd-spin 1s linear infinite;
      transform-origin: center;
    }
  `;
}

function buildSpinnerSvg(): string {
  // 24×24 SVG: full faint ring + one bright arc 270° → 360° to suggest
  // motion. Stroke colour uses currentColor so it inverts cleanly between
  // light and dark schemes.
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="12" cy="12" r="9"
        fill="none"
        stroke="currentColor"
        stroke-opacity="0.25"
        stroke-width="2.5"
      />
      <path
        d="M 12 3 A 9 9 0 0 1 21 12"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function buildCheckSvg(): string {
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M 5 12 L 10 17 L 19 7"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

function buildCrossSvg(): string {
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M 6 6 L 18 18 M 18 6 L 6 18"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function buildReducedMotionLabel(): string {
  return `<span class="nd-reduced-label" aria-hidden="true">…</span>`;
}
