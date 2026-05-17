/**
 * Result panel — shows the translation response, the cloud-mode banner
 * (when relevant), and a mock-mode notice.
 */
import React from "react";
import type { TranslationResponse } from "../../src/lib/types.js";

export interface PanelProps {
  readonly response: TranslationResponse | null;
  readonly loading: boolean;
  readonly cloudMode: boolean;
  readonly cloudProvider: string | null;
  readonly onClose: () => void;
}

export function Panel({
  response,
  loading,
  cloudMode,
  cloudProvider,
  onClose,
}: PanelProps): React.ReactElement {
  return (
    <div
      className="neurodock-panel"
      role="dialog"
      aria-live="polite"
      aria-label="NeuroDock translation result"
    >
      {cloudMode ? (
        <div className="neurodock-banner" data-testid="cloud-mode-banner">
          Cloud mode: text leaves your device for{" "}
          <strong>{cloudProvider ?? "the configured provider"}</strong>.
        </div>
      ) : null}
      {loading ? <p>Translating…</p> : null}
      {!loading && response ? <ResultBody response={response} /> : null}
      <div style={{ marginTop: 8, textAlign: "right" }}>
        <button
          type="button"
          className="neurodock-button"
          onClick={onClose}
          aria-label="Close NeuroDock result"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ResultBody({
  response,
}: {
  response: TranslationResponse;
}): React.ReactElement {
  if (!response.ok) {
    return <p style={{ color: "#7c5b1a" }}>Error: {response.error}</p>;
  }
  return (
    <div>
      {response.mockMode ? (
        <p
          style={{
            margin: "0 0 8px 0",
            padding: "4px 6px",
            border: "1px dashed #56564f",
            fontSize: 12,
          }}
        >
          Mock response — no LLM was called. Configure local Ollama or cloud
          mode in the popup to enable real translation.
        </p>
      ) : null}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 12,
          margin: 0,
          maxHeight: 240,
          overflow: "auto",
        }}
      >
        {JSON.stringify(response.data, null, 2)}
      </pre>
    </div>
  );
}
