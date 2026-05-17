/**
 * Top-level component for a per-site content-script island.
 *
 * Each per-site content script (gmail, slack, …) reuses this component to
 * stay consistent. The site-specific scripts decide only:
 *   - the host id (so script reruns find their own island);
 *   - any per-site quirks (e.g. SPA-specific selectors).
 */
import React, { useCallback, useEffect, useState } from "react";
import { FloatingButton } from "./floatingButton.js";
import { Panel } from "./panel.js";
import {
  startSelectionWatcher,
  type Editable,
} from "./selectionWatcher.js";
import type {
  Channel,
  ExtensionProfile,
  TranslationRequest,
  TranslationResponse,
} from "../../src/lib/types.js";

export interface ContentAppProps {
  readonly channel: Channel;
  readonly profile: ExtensionProfile;
  readonly requestTranslate: (
    request: TranslationRequest
  ) => Promise<TranslationResponse | null>;
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

  useEffect(() => {
    const handle = startSelectionWatcher(document, {
      onEditableFocus: (el) => setActiveEditable(el),
      onEditableBlur: () => setActiveEditable(null),
    });
    return handle.disconnect;
  }, []);

  const onActivate = useCallback(async () => {
    if (!activeEditable) return;
    const text = extractText(activeEditable);
    if (text.length === 0) return;
    setLoading(true);
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

  const anchor = activeEditable
    ? computeAnchor(activeEditable)
    : { top: -1000, left: -1000 };

  return (
    <>
      <FloatingButton
        visible={activeEditable !== null && !panelOpen}
        anchor={anchor}
        onActivate={onActivate}
      />
      {panelOpen ? (
        <div
          style={{
            position: "fixed",
            top: anchor.top,
            left: anchor.left + 80,
            pointerEvents: "auto",
            zIndex: 2147483647,
          }}
        >
          <Panel
            response={response}
            loading={loading}
            cloudMode={profile.mode === "cloud"}
            cloudProvider={profile.cloudProvider}
            onClose={() => setPanelOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function extractText(el: Editable): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.innerText;
}

function computeAnchor(el: Editable): { top: number; left: number } {
  const rect = el.getBoundingClientRect();
  // Float just above the top-right corner of the editable.
  return {
    top: Math.max(8, rect.top - 36),
    left: Math.max(8, rect.right - 100),
  };
}
