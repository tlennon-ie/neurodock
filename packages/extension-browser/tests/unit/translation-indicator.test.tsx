/**
 * Unit tests for entrypoints/_shared/translationIndicator.ts.
 *
 * Strategy: each test mounts a real indicator into jsdom, asserts on the
 * Shadow-DOM contents directly (state attribute + glyph SVG markers),
 * then either lets the auto-detach timers expire (vi.useFakeTimers) or
 * detaches manually. We avoid React-testing-library here because the
 * indicator is intentionally framework-free — it must run identically
 * inside any per-host content script without dragging React in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  attachIndicator,
  computeIndicatorPosition,
} from "../../entrypoints/_shared/translationIndicator.js";

function getHostElement(): HTMLElement | null {
  return document.querySelector("[data-neurodock-indicator]");
}

function getStateAttr(): string | null {
  const host = getHostElement();
  if (!host || !host.shadowRoot) return null;
  const inner = host.shadowRoot.querySelector(".nd-indicator");
  return inner?.getAttribute("data-state") ?? null;
}

function getGlyphHtml(): string {
  const host = getHostElement();
  if (!host || !host.shadowRoot) return "";
  const glyph = host.shadowRoot.querySelector(".nd-glyph");
  return glyph?.innerHTML ?? "";
}

function getLiveRegionText(): string {
  const host = getHostElement();
  if (!host || !host.shadowRoot) return "";
  const live = host.shadowRoot.querySelector(".nd-sr");
  return live?.textContent ?? "";
}

describe("attachIndicator — spinning state", () => {
  afterEach(() => {
    // Defensive cleanup in case a test forgot.
    document
      .querySelectorAll("[data-neurodock-indicator]")
      .forEach((el) => el.remove());
  });

  it("mounts a Shadow DOM host into document.body with a spinning glyph and a polite aria-live region", () => {
    const img = document.createElement("img");
    img.src = "https://example.test/a.png";
    document.body.appendChild(img);

    const handle = attachIndicator({ kind: "image", element: img });
    try {
      const host = getHostElement();
      expect(host).not.toBeNull();
      expect(host!.shadowRoot).not.toBeNull();
      expect(host!.shadowRoot!.mode).toBe("open");

      expect(getStateAttr()).toBe("spinning");
      expect(getGlyphHtml()).toContain("<svg");

      const live = host!.shadowRoot!.querySelector(".nd-sr");
      expect(live).not.toBeNull();
      expect(live!.getAttribute("aria-live")).toBe("polite");
      expect(live!.getAttribute("role")).toBe("status");
      expect(getLiveRegionText()).toMatch(/Translating/);
    } finally {
      handle.detach();
      img.remove();
    }
  });

  it("renders a reduced-motion variant with no spin keyframes when reducedMotion is true", () => {
    const img = document.createElement("img");
    img.src = "https://example.test/b.png";
    document.body.appendChild(img);

    const handle = attachIndicator(
      { kind: "image", element: img },
      { reducedMotion: true },
    );
    try {
      const host = getHostElement();
      expect(host).not.toBeNull();
      const styleEl = host!.shadowRoot!.querySelector("style");
      expect(styleEl).not.toBeNull();
      // No keyframes definition AND no spin animation rule emitted.
      expect(styleEl!.textContent).not.toContain("@keyframes nd-spin");
      expect(styleEl!.textContent).not.toContain("animation: nd-spin");
      // Static label rather than an SVG-only glyph.
      expect(getGlyphHtml()).toContain("nd-reduced-label");
      // Live region tells the user to wait.
      expect(getLiveRegionText()).toMatch(/please wait/i);
    } finally {
      handle.detach();
      img.remove();
    }
  });
});

describe("attachIndicator — success / failure morph + auto-detach", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document
      .querySelectorAll("[data-neurodock-indicator]")
      .forEach((el) => el.remove());
  });

  it("morphs to a check glyph on success() and auto-detaches after hold + fade", () => {
    const img = document.createElement("img");
    img.src = "https://example.test/c.png";
    document.body.appendChild(img);

    const handle = attachIndicator(
      { kind: "image", element: img },
      { successHoldMs: 1000, fadeOutMs: 200 },
    );

    expect(getStateAttr()).toBe("spinning");

    handle.success();
    expect(getStateAttr()).toBe("success");
    // Live region announces completion.
    expect(getLiveRegionText()).toMatch(/ready/i);
    // Glyph SVG path matches the check shape (M 5 12 L 10 17 L 19 7).
    expect(getGlyphHtml()).toMatch(/M\s*5\s*12\s*L\s*10\s*17\s*L\s*19\s*7/);

    // Advance past the success hold.
    vi.advanceTimersByTime(1000);
    expect(getStateAttr()).toBe("success-fade");
    expect(handle.isDetached()).toBe(false);

    // Advance through the fade-out.
    vi.advanceTimersByTime(200);
    expect(handle.isDetached()).toBe(true);
    expect(getHostElement()).toBeNull();

    img.remove();
  });

  it("morphs to a cross glyph on failure() and announces the error message", () => {
    const img = document.createElement("img");
    img.src = "https://example.test/d.png";
    document.body.appendChild(img);

    const handle = attachIndicator(
      { kind: "image", element: img },
      { failureHoldMs: 500, fadeOutMs: 100 },
    );

    handle.failure("VISION_MODEL_REQUIRED");
    expect(getStateAttr()).toBe("failure");
    expect(getLiveRegionText()).toMatch(/VISION_MODEL_REQUIRED/);
    // Glyph matches the cross shape (M 6 6 L 18 18).
    expect(getGlyphHtml()).toMatch(/M\s*6\s*6\s*L\s*18\s*18/);

    vi.advanceTimersByTime(500);
    expect(getStateAttr()).toBe("failure-fade");
    vi.advanceTimersByTime(100);
    expect(handle.isDetached()).toBe(true);
    expect(getHostElement()).toBeNull();

    img.remove();
  });

  it("detach() is idempotent and clears any pending auto-detach timer", () => {
    const handle = attachIndicator(
      { kind: "cursor", x: 100, y: 100 },
      { successHoldMs: 500, fadeOutMs: 100 },
    );

    handle.success();
    expect(handle.isDetached()).toBe(false);

    handle.detach();
    expect(handle.isDetached()).toBe(true);
    expect(getHostElement()).toBeNull();

    // Calling detach again is a no-op.
    handle.detach();
    expect(handle.isDetached()).toBe(true);

    // Advancing timers past the would-have-been auto-detach should not
    // throw (the scheduled fade transitions were cancelled).
    vi.advanceTimersByTime(10_000);
    expect(handle.isDetached()).toBe(true);
  });

  it("self-detaches on pagehide so stale indicators never leak across SPA navigation", () => {
    const handle = attachIndicator({ kind: "cursor", x: 10, y: 10 });
    expect(getHostElement()).not.toBeNull();

    window.dispatchEvent(new Event("pagehide"));
    expect(handle.isDetached()).toBe(true);
    expect(getHostElement()).toBeNull();
  });
});

describe("computeIndicatorPosition", () => {
  it("anchors top-right of a large image with a 4px inset", () => {
    const anchor = {
      kind: "image" as const,
      element: {
        getBoundingClientRect: () =>
          ({
            top: 100,
            left: 200,
            right: 500,
            bottom: 400,
            width: 300,
            height: 300,
            x: 200,
            y: 100,
          }) as DOMRect,
      } as HTMLImageElement,
    };
    const pos = computeIndicatorPosition(anchor, {
      innerWidth: 1024,
      innerHeight: 768,
    });
    // top-right corner at (500, 100), minus 32 (size) + 4 (inset) on
    // the left, plus 4 (inset) on top.
    expect(pos.left).toBe(500 - 32 - 4);
    expect(pos.top).toBe(100 + 4);
  });

  it("centres the indicator inside a small image instead of overflowing", () => {
    const anchor = {
      kind: "image" as const,
      element: {
        getBoundingClientRect: () =>
          ({
            top: 50,
            left: 50,
            right: 70,
            bottom: 70,
            width: 20,
            height: 20,
            x: 50,
            y: 50,
          }) as DOMRect,
      } as HTMLImageElement,
    };
    const pos = computeIndicatorPosition(anchor, {
      innerWidth: 1024,
      innerHeight: 768,
    });
    // Image is 20×20 — smaller than 32+8. Center: (50 + (20-32)/2, …)
    expect(pos.left).toBe(50 + (20 - 32) / 2);
    expect(pos.top).toBe(50 + (20 - 32) / 2);
  });

  it("offsets a cursor anchor by 12px below-right", () => {
    const pos = computeIndicatorPosition(
      { kind: "cursor", x: 400, y: 300 },
      { innerWidth: 1024, innerHeight: 768 },
    );
    expect(pos.left).toBe(412);
    expect(pos.top).toBe(312);
  });

  it("clamps to the viewport so the indicator never disappears off-screen", () => {
    // Cursor right at the bottom-right corner — would otherwise overflow.
    const pos = computeIndicatorPosition(
      { kind: "cursor", x: 1020, y: 760 },
      { innerWidth: 1024, innerHeight: 768 },
    );
    // 1024 - 32 - 4 = 988
    expect(pos.left).toBe(988);
    // 768 - 32 - 4 = 732
    expect(pos.top).toBe(732);
  });
});
