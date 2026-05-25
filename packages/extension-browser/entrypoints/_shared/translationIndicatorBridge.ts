/**
 * Content-script ↔ service-worker bridge for the in-page translation
 * progress indicator (0.0.31).
 *
 * Listens for two SW-originated messages on the active tab:
 *
 *   { type: "translation:starting", requestId, target }
 *       → mount a fresh indicator anchored to `target`.
 *
 *   { type: "translation:complete", requestId, ok, errorMessage? }
 *       → look up the indicator owning `requestId`, morph it to its
 *         success / failure state, and let it self-detach.
 *
 * Indicators are tracked in a module-level `Map<requestId, handle>` —
 * NOT in React state — so the indicator lifecycle is independent of any
 * island remount. This matters because the existing ContentApp listener
 * registers + tears down on every storage-change re-render; if we
 * stored the indicator handles inside React state, a profile update
 * mid-translation would orphan the in-flight indicator.
 */
import {
  attachIndicator,
  findImageElementByUrl,
  type IndicatorAnchor,
  type IndicatorHandle,
} from "./translationIndicator.js";
import type {
  RuntimeMessage,
  TranslationIndicatorTarget,
} from "../../src/lib/types.js";

interface RuntimeMessageApi {
  readonly addListener: (
    listener: (
      msg: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => boolean | undefined,
  ) => void;
  readonly removeListener: (
    listener: (
      msg: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => boolean | undefined,
  ) => void;
}

/**
 * Install the bridge. Returns an idempotent cleanup function the
 * caller invokes on island teardown. Safe to call when chrome.runtime
 * is undefined (returns a no-op cleanup) — keeps unit tests that don't
 * supply a chrome shim from blowing up.
 */
export function installTranslationIndicatorBridge(): () => void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return () => undefined;
  }
  const indicators = new Map<string, IndicatorHandle>();

  // Track the last context-menu cursor position so text-selection
  // translations have somewhere to anchor. `chrome.contextMenus.onClicked`
  // fires on the SW with no coords, so the content script must remember
  // where the user right-clicked. We use `contextmenu` (capture-phase)
  // because Gmail / Slack / GitHub all call `stopPropagation` on the
  // bubble phase for their own menu work.
  let lastContextMenuPosition: { x: number; y: number } | null = null;
  const onContextMenu = (event: MouseEvent): void => {
    lastContextMenuPosition = { x: event.clientX, y: event.clientY };
  };
  if (typeof document !== "undefined") {
    document.addEventListener("contextmenu", onContextMenu, {
      capture: true,
      passive: true,
    });
  }

  const listener = (
    msg: unknown,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: (response: unknown) => void,
  ): boolean | undefined => {
    if (isStartingMessage(msg)) {
      // If a stale indicator with the same id is somehow still alive,
      // detach it before we mount a new one. Defensive — the SW
      // guarantees unique requestIds via crypto.randomUUID, but we
      // never want two live indicators sharing one id.
      const stale = indicators.get(msg.requestId);
      if (stale) {
        stale.detach();
        indicators.delete(msg.requestId);
      }
      const anchor = resolveAnchor(msg.target, lastContextMenuPosition);
      if (anchor === null) {
        // No resolvable anchor (e.g. the <img> isn't on the page yet,
        // or the URL doesn't match). Skip the indicator silently — the
        // toolbar badge + the eventual panel / notification cover it.
        return undefined;
      }
      const handle = attachIndicator(anchor);
      indicators.set(msg.requestId, handle);
      return undefined;
    }
    if (isCompleteMessage(msg)) {
      const handle = indicators.get(msg.requestId);
      indicators.delete(msg.requestId);
      if (!handle) return undefined;
      if (msg.ok) {
        handle.success();
      } else {
        handle.failure(msg.errorMessage);
      }
      return undefined;
    }
    return undefined;
  };

  const api = chrome.runtime.onMessage as unknown as RuntimeMessageApi;
  api.addListener(listener);
  return () => {
    try {
      api.removeListener(listener);
    } catch {
      // removeListener can throw if the runtime is gone (SW teardown
      // during page unload). Indicators below clean themselves up.
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("contextmenu", onContextMenu, {
        capture: true,
      });
    }
    // Detach any indicators still in flight at teardown.
    for (const handle of indicators.values()) {
      handle.detach();
    }
    indicators.clear();
  };
}

function isStartingMessage(
  msg: unknown,
): msg is Extract<RuntimeMessage, { type: "translation:starting" }> {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as { type?: unknown; requestId?: unknown; target?: unknown };
  return (
    m.type === "translation:starting" &&
    typeof m.requestId === "string" &&
    typeof m.target === "object" &&
    m.target !== null
  );
}

function isCompleteMessage(
  msg: unknown,
): msg is Extract<RuntimeMessage, { type: "translation:complete" }> {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as { type?: unknown; requestId?: unknown; ok?: unknown };
  return (
    m.type === "translation:complete" &&
    typeof m.requestId === "string" &&
    typeof m.ok === "boolean"
  );
}

function resolveAnchor(
  target: TranslationIndicatorTarget,
  fallbackCursor: { readonly x: number; readonly y: number } | null,
): IndicatorAnchor | null {
  if (target.kind === "image") {
    const element = findImageElementByUrl(target.imageUrl);
    if (element === null) return null;
    return { kind: "image", element };
  }
  // cursor anchor: prefer SW-supplied coords; otherwise fall back to the
  // last tracked contextmenu position. If we have neither, skip the
  // indicator — there's no meaningful place to anchor it.
  const x = typeof target.x === "number" ? target.x : fallbackCursor?.x;
  const y = typeof target.y === "number" ? target.y : fallbackCursor?.y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { kind: "cursor", x, y };
}
