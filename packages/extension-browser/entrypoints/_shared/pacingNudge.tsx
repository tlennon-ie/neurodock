/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * In-page pacing-nudge toast (RFC B3).
 *
 * Subscribes to `watchdog:nudge` runtime messages from the service-
 * worker pacing ticker and renders a non-blocking toast in the corner
 * of the host Shadow-DOM panel. Dismissable; auto-dismisses after the
 * timeout in case the user has wandered away.
 *
 * Voice constraints (mirrored from
 * `packages/skills/hyperfocus-formatter/SKILL.md`):
 *   - NEVER the word "hyperfocus" in any rendered string.
 *   - Suggestion, not command. No exclamation marks.
 *   - Sentence case.
 *
 * Accessibility:
 *   - `role="status"` with `aria-live="polite"` so screen readers
 *     announce the suggestion without grabbing focus.
 *   - Dismiss button labelled "Dismiss pacing nudge".
 *   - Honours `prefers-reduced-motion` — the toast appears without a
 *     fade-in transform when reduced motion is requested.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { renderNudgeText, type PacingNudgeKind } from "../../src/lib/pacing.js";

const AUTO_DISMISS_MS = 60_000;

interface NudgeMessage {
  readonly type: "watchdog:nudge";
  readonly kind: Exclude<PacingNudgeKind, "none">;
  readonly minutesIn: number;
}

function isNudgeMessage(msg: unknown): msg is NudgeMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m["type"] !== "watchdog:nudge") return false;
  const kind = m["kind"];
  if (kind !== "break" && kind !== "long_session" && kind !== "timebox") {
    return false;
  }
  return typeof m["minutesIn"] === "number";
}

interface ActiveNudge {
  readonly kind: NudgeMessage["kind"];
  readonly minutesIn: number;
  /** Unique identity so React refreshes when a fresh nudge replaces a stale one. */
  readonly id: number;
}

export function PacingNudge(): React.ReactElement | null {
  const [active, setActive] = useState<ActiveNudge | null>(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return undefined;
    }
    const handler = (msg: unknown): void => {
      if (!isNudgeMessage(msg)) return;
      nextIdRef.current += 1;
      setActive({
        kind: msg.kind,
        minutesIn: msg.minutesIn,
        id: nextIdRef.current,
      });
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    if (active === null) return undefined;
    const handle = setTimeout(() => {
      setActive((current) => (current?.id === active.id ? null : current));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(handle);
  }, [active]);

  const onDismiss = useCallback(() => {
    setActive(null);
  }, []);

  if (active === null) return null;
  const text = renderNudgeText(active.kind, active.minutesIn);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="neurodock-pacing-nudge"
      className="neurodock-toast"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        left: "auto",
        top: "auto",
        maxWidth: 360,
        pointerEvents: "auto",
        zIndex: 2147483646,
      }}
    >
      <div className="neurodock-toast-body">
        <div className="neurodock-toast-title">{text.title}</div>
        <div className="neurodock-toast-text">{text.body}</div>
      </div>
      <button
        type="button"
        className="neurodock-button neurodock-toast-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss pacing nudge"
        data-testid="neurodock-pacing-nudge-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
