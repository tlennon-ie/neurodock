/**
 * Top-level component for a per-site content-script island.
 *
 * Each per-site content script (gmail, slack, …) reuses this component to
 * stay consistent. The site-specific scripts decide only:
 *   - the host id (so script reruns find their own island);
 *   - any per-site quirks (e.g. SPA-specific selectors).
 *
 * Two activation paths:
 *   A. Floating button — surfaces while a compose box is focused, then
 *      runs `check_tone` against the editable's contents.
 *   B. Right-click context menu — service worker dispatches
 *      `neurodock:context-result` to the tab; we open the panel with
 *      that response. Anchor falls back to viewport top-right when no
 *      editable is focused (e.g. user right-clicked a selection in an
 *      email they were reading, not a compose box).
 *
 * Until 0.0.7 the right-click broadcast had no listener — the message
 * was silently dropped. That is the bug this component fixes.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FloatingButton } from "./floatingButton.js";
import { Panel } from "./panel.js";
import { startSelectionWatcher, type Editable } from "./selectionWatcher.js";
import type {
  Channel,
  ExtensionProfile,
  RuntimeMessage,
  TranslationRequest,
  TranslationResponse,
} from "../../src/lib/types.js";

export interface ContentAppProps {
  readonly channel: Channel;
  readonly profile: ExtensionProfile;
  readonly requestTranslate: (
    request: TranslationRequest,
  ) => Promise<TranslationResponse | null>;
}

interface PanelAnchor {
  readonly top: number;
  readonly left: number;
}

export function ContentApp({
  channel,
  profile,
  requestTranslate,
}: ContentAppProps): React.ReactElement {
  const [activeEditable, setActiveEditable] = useState<Editable | null>(null);
  const [response, setResponse] = useState<TranslationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [contextSourceText, setContextSourceText] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const handle = startSelectionWatcher(document, {
      onEditableFocus: (el) => setActiveEditable(el),
      onEditableBlur: () => setActiveEditable(null),
    });
    return handle.disconnect;
  }, []);

  // Listen for the right-click "translate selection" broadcast from the
  // service worker. The browser bus is shared between tabs.sendMessage
  // and runtime.sendMessage from the receiver's POV, so a single
  // runtime.onMessage listener covers both.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return undefined;
    }
    const handler = (msg: unknown): void => {
      if (!isContextResultMessage(msg)) return;
      setResponse(msg.response);
      setContextSourceText(msg.sourceText);
      setLoading(false);
      setPanelOpen(true);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const onActivate = useCallback(async () => {
    if (!activeEditable) return;
    const text = extractText(activeEditable);
    if (text.length === 0) return;
    setLoading(true);
    setContextSourceText(null);
    setPanelOpen(true);
    try {
      const res = await requestTranslate({
        tool: "check_tone",
        input: { text, channel },
        channel,
      });
      setResponse(res);
    } finally {
      setLoading(false);
    }
  }, [activeEditable, channel, requestTranslate]);

  const onClosePanel = useCallback(() => {
    setPanelOpen(false);
    setContextSourceText(null);
  }, []);

  const buttonAnchor = activeEditable
    ? computeButtonAnchor(activeEditable)
    : null;

  return (
    <>
      <FloatingButton
        visible={activeEditable !== null && !panelOpen}
        anchor={buttonAnchor ?? { top: -1000, left: -1000 }}
        onActivate={onActivate}
      />
      {panelOpen ? (
        // 0.0.15: panel position is now CSS-only (top-right of viewport
        // with explicit right margin). Previous anchor-math approach
        // depended on viewport-width math at render time and frequently
        // mispositioned when the user scrolled or the panel grew taller
        // than expected. Fixed positioning + max-height: 80vh +
        // overflow-y in the .neurodock-panel CSS keeps the panel inside
        // the viewport on every page width.
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            left: "auto",
            bottom: "auto",
            pointerEvents: "auto",
            zIndex: 2147483647,
          }}
        >
          <Panel
            response={response}
            loading={loading}
            cloudMode={profile.mode === "cloud"}
            cloudProvider={profile.cloudProvider}
            configuredProvider={resolveConfiguredProvider(profile)}
            onClose={onClosePanel}
            sourceText={contextSourceText}
          />
        </div>
      ) : null}
    </>
  );
}

function isContextResultMessage(
  msg: unknown,
): msg is Extract<RuntimeMessage, { type: "neurodock:context-result" }> {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as { type?: unknown };
  return m.type === "neurodock:context-result";
}

function extractText(el: Editable): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.innerText;
}

function computeButtonAnchor(el: Editable): PanelAnchor {
  const rect = el.getBoundingClientRect();
  return {
    top: Math.max(8, rect.top - 36),
    left: Math.max(8, rect.right - 100),
  };
}

function resolveConfiguredProvider(profile: ExtensionProfile): string | null {
  if (profile.mode === "mock") return "mock";
  if (profile.mode === "cloud") return profile.cloudProvider;
  return profile.localProvider;
}

// computePanelAnchor and SourceTextPreview deleted in 0.0.15:
// - panel position is now CSS-only (fixed top-right + max-height: 80vh
//   in mountIsland.ts), so per-render anchor math is unnecessary.
// - the source-text preview moved into Panel itself as a styled section
//   (matching the panel's own background) so it no longer clashes with
//   the host page background (Gmail's white, GitHub's dark, etc.).
