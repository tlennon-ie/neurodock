/**
 * Tests for the content-script ↔ service-worker indicator bridge
 * (`installTranslationIndicatorBridge`). Pins the message protocol
 * end of the round-trip: the SW sends start/complete; the bridge
 * mounts an indicator on start and morphs / detaches on complete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installTranslationIndicatorBridge } from "../../entrypoints/_shared/translationIndicatorBridge.js";

type MessageListener = (
  msg: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

interface RuntimeShim {
  readonly onMessage: {
    readonly listeners: MessageListener[];
    readonly addListener: (l: MessageListener) => void;
    readonly removeListener: (l: MessageListener) => void;
  };
}

function installRuntimeShim(): RuntimeShim {
  const listeners: MessageListener[] = [];
  const shim: RuntimeShim = {
    onMessage: {
      listeners,
      addListener: (l: MessageListener) => {
        listeners.push(l);
      },
      removeListener: (l: MessageListener) => {
        const i = listeners.indexOf(l);
        if (i !== -1) listeners.splice(i, 1);
      },
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: shim.onMessage
      ? { onMessage: shim.onMessage }
      : { onMessage: shim.onMessage },
  };
  return shim;
}

function dispatch(shim: RuntimeShim, msg: unknown): void {
  for (const l of shim.onMessage.listeners) {
    l(msg, {} as chrome.runtime.MessageSender, () => undefined);
  }
}

describe("installTranslationIndicatorBridge — image anchor", () => {
  let shim: RuntimeShim;

  beforeEach(() => {
    shim = installRuntimeShim();
  });

  afterEach(() => {
    document
      .querySelectorAll("[data-neurodock-indicator]")
      .forEach((el) => el.remove());
    document.querySelectorAll("img").forEach((el) => el.remove());
  });

  it("mounts an indicator when translation:starting arrives with a matching image, then detaches on translation:complete (success)", () => {
    vi.useFakeTimers();
    const img = document.createElement("img");
    img.src = "https://example.test/x.png";
    document.body.appendChild(img);
    // jsdom does not populate currentSrc unless we set it explicitly.
    Object.defineProperty(img, "currentSrc", {
      value: "https://example.test/x.png",
      configurable: true,
    });

    const cleanup = installTranslationIndicatorBridge();
    try {
      dispatch(shim, {
        type: "translation:starting",
        requestId: "req-1",
        target: { kind: "image", imageUrl: "https://example.test/x.png" },
      });

      let host = document.querySelector("[data-neurodock-indicator]");
      expect(host).not.toBeNull();
      expect(
        host!
          .shadowRoot!.querySelector(".nd-indicator")!
          .getAttribute("data-state"),
      ).toBe("spinning");

      dispatch(shim, {
        type: "translation:complete",
        requestId: "req-1",
        ok: true,
      });

      host = document.querySelector("[data-neurodock-indicator]");
      expect(host).not.toBeNull();
      expect(
        host!
          .shadowRoot!.querySelector(".nd-indicator")!
          .getAttribute("data-state"),
      ).toBe("success");

      // Advance past hold + fade so the indicator self-detaches.
      vi.advanceTimersByTime(5000);
      expect(document.querySelector("[data-neurodock-indicator]")).toBeNull();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("silently skips when no matching <img> is on the page", () => {
    const cleanup = installTranslationIndicatorBridge();
    try {
      dispatch(shim, {
        type: "translation:starting",
        requestId: "req-2",
        target: { kind: "image", imageUrl: "https://nowhere/none.png" },
      });
      expect(document.querySelector("[data-neurodock-indicator]")).toBeNull();
    } finally {
      cleanup();
    }
  });
});

describe("installTranslationIndicatorBridge — cursor anchor with contextmenu fallback", () => {
  let shim: RuntimeShim;

  beforeEach(() => {
    shim = installRuntimeShim();
  });

  afterEach(() => {
    document
      .querySelectorAll("[data-neurodock-indicator]")
      .forEach((el) => el.remove());
  });

  it("uses the last-tracked contextmenu position when the SW omits cursor coords", () => {
    const cleanup = installTranslationIndicatorBridge();
    try {
      // Simulate a right-click — the capture-phase contextmenu listener
      // records (clientX, clientY).
      const event = new MouseEvent("contextmenu", {
        clientX: 400,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      dispatch(shim, {
        type: "translation:starting",
        requestId: "req-cursor-1",
        target: { kind: "cursor" }, // no coords from SW
      });

      const host = document.querySelector(
        "[data-neurodock-indicator]",
      ) as HTMLElement | null;
      expect(host).not.toBeNull();
      // Indicator is positioned 12px below-right of the cursor.
      expect(host!.style.left).toBe("412px");
      expect(host!.style.top).toBe("312px");
    } finally {
      cleanup();
    }
  });

  it("renders the failure state with the SW-supplied error message", () => {
    vi.useFakeTimers();
    const cleanup = installTranslationIndicatorBridge();
    try {
      document.dispatchEvent(
        new MouseEvent("contextmenu", {
          clientX: 10,
          clientY: 10,
          bubbles: true,
        }),
      );
      dispatch(shim, {
        type: "translation:starting",
        requestId: "req-err",
        target: { kind: "cursor" },
      });
      dispatch(shim, {
        type: "translation:complete",
        requestId: "req-err",
        ok: false,
        errorMessage: "VISION_MODEL_REQUIRED",
      });

      const host = document.querySelector(
        "[data-neurodock-indicator]",
      ) as HTMLElement | null;
      expect(host).not.toBeNull();
      expect(
        host!
          .shadowRoot!.querySelector(".nd-indicator")!
          .getAttribute("data-state"),
      ).toBe("failure");
      expect(host!.shadowRoot!.querySelector(".nd-sr")!.textContent).toMatch(
        /VISION_MODEL_REQUIRED/,
      );

      vi.advanceTimersByTime(10_000);
      expect(document.querySelector("[data-neurodock-indicator]")).toBeNull();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("cleanup detaches any in-flight indicator", () => {
    const cleanup = installTranslationIndicatorBridge();
    document.dispatchEvent(
      new MouseEvent("contextmenu", {
        clientX: 50,
        clientY: 50,
        bubbles: true,
      }),
    );
    dispatch(shim, {
      type: "translation:starting",
      requestId: "req-cleanup",
      target: { kind: "cursor" },
    });
    expect(document.querySelector("[data-neurodock-indicator]")).not.toBeNull();
    cleanup();
    expect(document.querySelector("[data-neurodock-indicator]")).toBeNull();
  });
});
