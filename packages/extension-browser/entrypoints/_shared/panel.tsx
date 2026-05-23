/**
 * Result panel — shows the translation response, the cloud-mode banner
 * (when relevant), a mock-mode notice, and (0.0.8+) a silent-fallback
 * banner when the configured provider was unreachable and the extension
 * answered with the deterministic mock.
 *
 * Pre-0.0.8 the fallback banner only existed in the popup. The user's
 * in-page panel just showed the mock JSON with no indication their
 * configured provider had failed — same class of "silent failure" the
 * popup banner exists to prevent. The 0.0.8 panel surfaces it inline.
 */
import React from "react";
import type {
  ExtensionProfile,
  TranslationResponse,
} from "../../src/lib/types.js";

export interface PanelProps {
  readonly response: TranslationResponse | null;
  readonly loading: boolean;
  readonly cloudMode: boolean;
  readonly cloudProvider: string | null;
  readonly onClose: () => void;
  /**
   * The provider the user CONFIGURED (e.g. "lmstudio"). Used to detect
   * a silent fallback: when `response.provenance.provider !== this AND
   * this is not "mock"`, the configured provider was unreachable and
   * the mock responded instead. Surfaced via a banner so the user
   * realises why the result looks mock-like.
   */
  readonly configuredProvider?:
    | ExtensionProfile["localProvider"]
    | string
    | null;
}

export function Panel({
  response,
  loading,
  cloudMode,
  cloudProvider,
  onClose,
  configuredProvider,
}: PanelProps): React.ReactElement {
  const fellBack = detectFallback(response, configuredProvider);
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
      {fellBack ? (
        <div
          data-testid="silent-fallback-banner"
          style={{
            marginBottom: 6,
            padding: "4px 6px",
            border: "1px solid #c08a3a",
            background: "rgba(192,138,58,0.08)",
            fontSize: 12,
          }}
        >
          <strong>Heads up:</strong> your configured provider (
          <code>{configuredProvider}</code>) was unreachable, so the extension
          fell back to the mock provider. Open Settings → Test to diagnose.
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

function detectFallback(
  response: TranslationResponse | null,
  configuredProvider: PanelProps["configuredProvider"],
): boolean {
  if (response === null) return false;
  if (!response.mockMode) return false;
  if (typeof configuredProvider !== "string") return false;
  if (configuredProvider.length === 0) return false;
  if (configuredProvider === "mock") return false;
  return response.provenance.provider !== configuredProvider;
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
