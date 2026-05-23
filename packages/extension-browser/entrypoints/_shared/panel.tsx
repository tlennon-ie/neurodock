/**
 * Result panel — renders a TranslationResponse as structured, ND-readable
 * UI (no JSON dumps). Each tool gets a dedicated view component:
 *
 *   translate_incoming -> TranslateIncomingView
 *   check_tone         -> CheckToneView
 *   rewrite_outgoing   -> RewriteOutgoingView
 *   brief_meeting      -> BriefMeetingView
 *
 * Pre-0.0.12 the panel rendered `<pre>{JSON.stringify(data)}</pre>` — the
 * user saw a monospaced JSON blob harder to parse than the source text.
 * This rewrite is the first version where the panel actually delivers the
 * "decoded subtext" promise of the manifesto.
 *
 * Voice rules baked in: no clinical phrasing, no marketing intensifiers,
 * literal labels, recommendations not prescriptions. Confidence is shown
 * as a coarse band (low / medium / high) rather than three decimal places.
 */
import React, { useState } from "react";
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
  /**
   * 0.0.15: original text or image URL the user right-clicked. Rendered
   * inside the panel (above the result) so it always sits on the panel
   * background — previously SourceTextPreview was an unstyled sibling
   * and clashed with the host page's background on Gmail / GitHub.
   */
  readonly sourceText?: string | null;
}

export function Panel({
  response,
  loading,
  cloudMode,
  cloudProvider,
  onClose,
  configuredProvider,
  sourceText,
}: PanelProps): React.ReactElement {
  const fellBack = detectFallback(response, configuredProvider);
  return (
    <div
      className="neurodock-panel"
      role="dialog"
      aria-live="polite"
      aria-label="NeuroDock translation result"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 13, letterSpacing: "0.02em" }}>
          NeuroDock {response ? toolLabel(response.tool) : ""}
        </strong>
        <button
          type="button"
          className="neurodock-button"
          onClick={onClose}
          aria-label="Close NeuroDock result"
          style={{ padding: "2px 8px", fontSize: 12 }}
        >
          Close
        </button>
      </div>

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
      {sourceText && sourceText.length > 0 ? (
        <SourcePreview text={sourceText} />
      ) : null}
      {loading ? <p style={{ margin: 0 }}>Translating…</p> : null}
      {!loading && response ? <ResultBody response={response} /> : null}
      {response ? <ProvenanceLine response={response} /> : null}
    </div>
  );
}

export function SourcePreview({ text }: { text: string }): React.ReactElement {
  const isUrl = /^https?:\/\//.test(text) || text.startsWith("data:");
  // 0.0.21: when the source is an image URL (right-click describe), also
  // show a small thumbnail of the image — knowing the URL alone wasn't
  // enough to tell *which* image you described, especially when several
  // similar avatars or thumbnails sit next to each other on a page.
  const isImage =
    text.startsWith("data:image/") ||
    /^https?:\/\/[^\s]+\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|$)/i.test(text);
  return (
    <div
      data-testid="context-source-preview"
      style={{
        marginBottom: 8,
        padding: "6px 8px",
        background: "rgba(0,0,0,0.05)",
        borderLeft: "3px solid rgba(0,0,0,0.25)",
        fontSize: 12,
        fontStyle: isUrl ? "normal" : "italic",
        maxHeight: 220,
        overflow: "auto",
        wordBreak: isUrl ? "break-all" : "normal",
      }}
    >
      {isImage ? (
        <img
          src={text}
          alt="Source image (right-clicked)"
          style={{
            maxWidth: "100%",
            maxHeight: 140,
            display: "block",
            marginBottom: 4,
            objectFit: "contain",
            background: "rgba(0,0,0,0.04)",
          }}
        />
      ) : null}
      {isUrl ? (
        <code style={{ fontFamily: "ui-monospace, monospace" }}>{text}</code>
      ) : (
        text
      )}
    </div>
  );
}

function toolLabel(tool: TranslationResponse["tool"]): string {
  if (tool === "translate_incoming") return "decoded";
  if (tool === "check_tone") return "tone check";
  if (tool === "rewrite_outgoing") return "rewrite";
  if (tool === "brief_meeting") return "meeting brief";
  if (tool === "describe_image") return "image described";
  return "result";
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
    return (
      <p style={{ color: "#7c5b1a", margin: 0 }}>Error: {response.error}</p>
    );
  }
  const data = response.data;
  if (data === null || typeof data !== "object") {
    return <p style={{ margin: 0 }}>(empty response)</p>;
  }
  return (
    <>
      {response.mockMode ? <MockNotice /> : null}
      <ToolView tool={response.tool} data={data as Record<string, unknown>} />
    </>
  );
}

function MockNotice(): React.ReactElement {
  return (
    <p
      style={{
        margin: "0 0 8px 0",
        padding: "4px 6px",
        border: "1px dashed #56564f",
        fontSize: 12,
      }}
    >
      Mock response — no LLM was called. Configure local Ollama or cloud mode in
      the popup to enable real translation.
    </p>
  );
}

function ProvenanceLine({
  response,
}: {
  response: TranslationResponse;
}): React.ReactElement {
  return (
    <p
      style={{
        margin: "10px 0 0 0",
        fontSize: 11,
        color: "rgba(0,0,0,0.55)",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        paddingTop: 6,
      }}
      data-testid="provenance-line"
    >
      via {response.provenance.provider} · {response.provenance.model} ·{" "}
      {response.provenance.mode}
    </p>
  );
}

export function ToolView({
  tool,
  data,
}: {
  tool: TranslationResponse["tool"];
  data: Record<string, unknown>;
}): React.ReactElement {
  if (tool === "translate_incoming") {
    return <TranslateIncomingView data={data} />;
  }
  if (tool === "check_tone") {
    return <CheckToneView data={data} />;
  }
  if (tool === "rewrite_outgoing") {
    return <RewriteOutgoingView data={data} />;
  }
  if (tool === "brief_meeting") {
    return <BriefMeetingView data={data} />;
  }
  if (tool === "describe_image") {
    return <ImageDescribeView data={data} />;
  }
  return <UnknownToolFallback data={data} />;
}

// ─────────────────────────────────────────────────────────────────────────
// describe_image
// ─────────────────────────────────────────────────────────────────────────

function ImageDescribeView({
  data,
}: {
  data: Record<string, unknown>;
}): React.ReactElement {
  const description =
    typeof data.description === "string" ? data.description : "";
  const containsText = data.contains_text === true;
  const transcribedText =
    typeof data.transcribed_text === "string" &&
    data.transcribed_text.length > 0
      ? data.transcribed_text
      : null;
  const keyElements = Array.isArray(data.key_elements)
    ? (data.key_elements as unknown[]).filter(
        (e): e is string => typeof e === "string",
      )
    : [];
  const inferredPurpose =
    typeof data.inferred_purpose === "string" ? data.inferred_purpose : "";
  const altText =
    typeof data.accessibility_notes === "string" &&
    data.accessibility_notes.length > 0
      ? data.accessibility_notes
      : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {description.length > 0 ? <TldrCard text={description} /> : null}

      <Section label="What it's for">
        <p style={{ margin: 0 }}>
          {inferredPurpose.length > 0 ? inferredPurpose : "(not inferred)"}
        </p>
      </Section>

      {containsText && transcribedText ? (
        <Section label="Text in the image">
          <CopyableDraft text={transcribedText} />
        </Section>
      ) : null}

      {keyElements.length > 0 ? (
        <Collapsible label={`Key elements (${keyElements.length})`}>
          <ul
            style={{
              margin: "4px 0 0 0",
              paddingLeft: 18,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {keyElements.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Collapsible>
      ) : null}

      {altText ? (
        <Section label="Suggested alt text">
          <p style={{ margin: 0, fontStyle: "italic" }}>{altText}</p>
        </Section>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// translate_incoming
// ─────────────────────────────────────────────────────────────────────────

interface SubtextItem {
  readonly text: string;
  readonly confidence: number;
}

interface AmbiguitySpanData {
  readonly start_char?: number;
  readonly end_char?: number;
  readonly reason?: string;
  readonly note?: string | null;
}

interface NextActionData {
  readonly action?: string;
  readonly reason?: string;
  readonly draft_reply?: string | null;
}

function TranslateIncomingView({
  data,
}: {
  data: Record<string, unknown>;
}): React.ReactElement {
  const explicitAsk =
    typeof data.explicit_ask === "string" ? data.explicit_ask : null;
  const subtexts = Array.isArray(data.likely_subtext)
    ? (data.likely_subtext as SubtextItem[]).filter(
        (s) => s && typeof s.text === "string",
      )
    : [];
  const ambiguity =
    isRecord(data.ambiguity) && Array.isArray(data.ambiguity.spans)
      ? (data.ambiguity.spans as AmbiguitySpanData[])
      : [];
  const next = isRecord(data.recommended_next_action)
    ? (data.recommended_next_action as NextActionData)
    : null;

  // Build the TL;DR — one sentence the user reads first. Priority:
  // 1. Explicit ask if present (the literal request)
  // 2. Highest-confidence subtext if no explicit ask
  // 3. Fall back to "Informational — no action needed".
  const tldr = buildTldr(explicitAsk, subtexts, next);

  // ND-friendly: action goes FIRST, analysis is collapsible. Most users
  // want "tell me what to do", not "explain the message structure".
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TldrCard text={tldr} />

      {next ? <ActionCard next={next} /> : null}

      {subtexts.length > 0 ? (
        <Collapsible
          label={`Why they probably wrote this (${subtexts.length})`}
        >
          <ol
            style={{
              margin: "4px 0 0 0",
              paddingLeft: 18,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {subtexts.slice(0, 5).map((s, i) => (
              <li key={i}>
                {s.text} <ConfidenceBadge value={Number(s.confidence) || 0} />
              </li>
            ))}
          </ol>
        </Collapsible>
      ) : null}

      {ambiguity.length > 0 ? (
        <Collapsible label={`Worth checking (${ambiguity.length})`}>
          <ul
            style={{
              margin: "4px 0 0 0",
              paddingLeft: 18,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {ambiguity.map((span, i) => (
              <li key={i}>
                {humaniseAmbiguityReason(span.reason)}
                {span.note ? <> — {span.note}</> : null}
              </li>
            ))}
          </ul>
        </Collapsible>
      ) : null}
    </div>
  );
}

function buildTldr(
  explicitAsk: string | null,
  subtexts: SubtextItem[],
  next: NextActionData | null,
): string {
  if (explicitAsk !== null && explicitAsk.length > 0) {
    return explicitAsk;
  }
  if (subtexts.length > 0 && typeof subtexts[0]!.text === "string") {
    return subtexts[0]!.text;
  }
  if (next && typeof next.action === "string") {
    const verb = humaniseAction(next.action);
    return `Informational — ${verb}.`;
  }
  return "Informational message — no direct request.";
}

function humaniseAction(action: string): string {
  switch (action.toLowerCase()) {
    case "reply":
      return "they want a reply";
    case "clarify":
      return "they want clarification";
    case "acknowledge":
      return "just acknowledge you've read it";
    case "set_reminder":
      return "set a reminder to revisit";
    case "escalate":
      return "escalate to the right person";
    case "ignore":
      return "no action needed";
    case "defer":
      return "defer for now, revisit later";
    default:
      return action;
  }
}

function humaniseAmbiguityReason(reason: string | undefined): string {
  switch ((reason ?? "").toLowerCase()) {
    case "vague_timeline":
      return "Timing is fuzzy";
    case "vague_referent":
      return "Unclear what they mean";
    case "unassigned_owner":
      return "No owner named";
    case "hedged_commitment":
      return "Commitment is hedged";
    case "deferred_topic":
      return "Topic deferred without resolution";
    case "contested":
      return "Disagreement in the thread";
    case "other":
      return "Worth a closer look";
    default:
      return "Worth a closer look";
  }
}

function TldrCard({ text }: { text: string }): React.ReactElement {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(0,0,0,0.04)",
        borderLeft: "3px solid #56564f",
        fontSize: 15,
        lineHeight: 1.45,
      }}
      data-testid="panel-tldr"
    >
      {text}
    </div>
  );
}

function ActionCard({ next }: { next: NextActionData }): React.ReactElement {
  const action = typeof next.action === "string" ? next.action : "consider";
  const reason = typeof next.reason === "string" ? next.reason : "";
  const draft =
    typeof next.draft_reply === "string" && next.draft_reply.length > 0
      ? next.draft_reply
      : null;
  const verb = humaniseAction(action);
  return (
    <section
      data-testid="panel-action"
      style={{
        padding: "10px 12px",
        border: "1px solid rgba(0,0,0,0.18)",
      }}
    >
      <h3
        style={{
          margin: "0 0 4px 0",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          opacity: 0.7,
          fontWeight: 600,
        }}
      >
        Do this
      </h3>
      <p style={{ margin: "0 0 6px 0", fontSize: 14, fontWeight: 600 }}>
        {capitalise(verb)}
      </p>
      {reason ? (
        <p style={{ margin: "0 0 8px 0", fontSize: 13, opacity: 0.85 }}>
          {reason}
        </p>
      ) : null}
      {draft ? (
        <>
          <h4
            style={{
              margin: "8px 0 4px 0",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              opacity: 0.6,
              fontWeight: 600,
            }}
          >
            Draft reply
          </h4>
          <CopyableDraft text={draft} />
        </>
      ) : null}
    </section>
  );
}

function capitalise(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Collapsible({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: "inherit",
          width: "100%",
          padding: "4px 0",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 10,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "none",
          }}
        >
          ▸
        </span>
        <span>{label}</span>
      </button>
      {open ? (
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{children}</div>
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// check_tone
// ─────────────────────────────────────────────────────────────────────────

interface ToneAxes {
  readonly directness?: number;
  readonly warmth?: number;
  readonly urgency?: number;
}
interface FlaggedPhrase {
  readonly phrase?: string;
  readonly axis?: string;
  readonly delta?: number;
  readonly note?: string | null;
}

function CheckToneView({
  data,
}: {
  data: Record<string, unknown>;
}): React.ReactElement {
  const axes = isRecord(data.axes) ? (data.axes as ToneAxes) : {};
  const target = isRecord(data.axes_target)
    ? (data.axes_target as ToneAxes)
    : null;
  const flagged = Array.isArray(data.flagged_phrases)
    ? (data.flagged_phrases as FlaggedPhrase[])
    : [];
  const hint =
    typeof data.suggested_rewrite_hint === "string"
      ? data.suggested_rewrite_hint
      : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section label="Tone (0–100)">
        <ToneBar
          label="Direct"
          value={axes.directness}
          target={target?.directness}
        />
        <ToneBar label="Warm" value={axes.warmth} target={target?.warmth} />
        <ToneBar label="Urgent" value={axes.urgency} target={target?.urgency} />
      </Section>
      {flagged.length > 0 ? (
        <Section label="Flagged phrases">
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {flagged.map((f, i) => (
              <li key={i}>
                {f.phrase ? <em>"{f.phrase}"</em> : null}{" "}
                {f.axis ? <code>{f.axis}</code> : null}
                {typeof f.delta === "number"
                  ? ` ${f.delta > 0 ? "+" : ""}${f.delta.toFixed(0)}`
                  : null}
                {f.note ? ` — ${f.note}` : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {hint ? (
        <Section label="Hint">
          <p style={{ margin: 0, fontStyle: "italic" }}>{hint}</p>
        </Section>
      ) : null}
    </div>
  );
}

function ToneBar({
  label,
  value,
  target,
}: {
  label: string;
  value: number | undefined;
  target?: number | undefined;
}): React.ReactElement {
  const v = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  const t =
    typeof target === "number" ? Math.max(0, Math.min(100, target)) : null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
        }}
      >
        <span>{label}</span>
        <span>
          {v.toFixed(0)}
          {t !== null ? ` / target ${t.toFixed(0)}` : ""}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 6,
          background: "rgba(0,0,0,0.08)",
        }}
        aria-label={`${label} score ${v.toFixed(0)} out of 100`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${v}%`,
            background: "#56564f",
          }}
        />
        {t !== null ? (
          <div
            style={{
              position: "absolute",
              top: -2,
              bottom: -2,
              left: `${t}%`,
              width: 2,
              background: "#c08a3a",
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// rewrite_outgoing
// ─────────────────────────────────────────────────────────────────────────

function RewriteOutgoingView({
  data,
}: {
  data: Record<string, unknown>;
}): React.ReactElement {
  const rewritten = typeof data.rewritten === "string" ? data.rewritten : "";
  const unpreserved = Array.isArray(data.unpreserved_terms)
    ? (data.unpreserved_terms as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : [];
  const diff = isRecord(data.diff_summary)
    ? (data.diff_summary as { tone_shift?: string; warnings?: unknown[] })
    : null;
  const warnings = Array.isArray(diff?.warnings)
    ? (diff!.warnings as unknown[]).filter(
        (w): w is string => typeof w === "string",
      )
    : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section label="Rewritten">
        <CopyableDraft text={rewritten} />
      </Section>
      {diff?.tone_shift ? (
        <Section label="Tone shift">
          <p style={{ margin: 0 }}>{diff.tone_shift}</p>
        </Section>
      ) : null}
      {unpreserved.length > 0 ? (
        <Section label="Terms not preserved">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {unpreserved.map((t, i) => (
              <li key={i}>
                <code>{t}</code>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {warnings.length > 0 ? (
        <Section label="Warnings">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// brief_meeting
// ─────────────────────────────────────────────────────────────────────────

interface MeetingAsk {
  readonly text?: string;
  readonly asker?: string;
  readonly due?: string | null;
  readonly quoted_span?: { text?: string };
}
interface MeetingDecision {
  readonly text?: string;
  readonly decided_by?: readonly string[];
  readonly quoted_span?: { text?: string };
}
interface MeetingAmbiguous {
  readonly text?: string;
  readonly reason?: string;
  readonly quoted_span?: { text?: string };
}

function BriefMeetingView({
  data,
}: {
  data: Record<string, unknown>;
}): React.ReactElement {
  const myAsks = Array.isArray(data.my_asks)
    ? (data.my_asks as MeetingAsk[])
    : [];
  const othersAsks = Array.isArray(data.others_asks)
    ? (data.others_asks as MeetingAsk[])
    : [];
  const decisions = Array.isArray(data.decisions)
    ? (data.decisions as MeetingDecision[])
    : [];
  const ambiguous = Array.isArray(data.ambiguous_items)
    ? (data.ambiguous_items as MeetingAmbiguous[])
    : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section label="Asks on me">
        <AskList items={myAsks} />
      </Section>
      <Section label="My asks of others">
        <AskList items={othersAsks} />
      </Section>
      <Section label="Decisions">
        {decisions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>(none)</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {decisions.map((d, i) => (
              <li key={i}>
                {d.text}
                {d.decided_by && d.decided_by.length > 0
                  ? ` (by ${d.decided_by.join(", ")})`
                  : null}
                {d.quoted_span?.text ? (
                  <Quote text={d.quoted_span.text} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section label="Unclear">
        {ambiguous.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>(none)</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ambiguous.map((a, i) => (
              <li key={i}>
                <strong>{a.reason ?? "other"}</strong>: {a.text}
                {a.quoted_span?.text ? (
                  <Quote text={a.quoted_span.text} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function AskList({ items }: { items: MeetingAsk[] }): React.ReactElement {
  if (items.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>(none)</p>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((a, i) => (
        <li key={i}>
          {a.text}
          {a.asker ? ` — from ${a.asker}` : null}
          {a.due ? ` (due ${a.due})` : null}
          {a.quoted_span?.text ? <Quote text={a.quoted_span.text} /> : null}
        </li>
      ))}
    </ul>
  );
}

function Quote({ text }: { text: string }): React.ReactElement {
  return (
    <div
      style={{
        marginTop: 2,
        paddingLeft: 8,
        borderLeft: "2px solid rgba(0,0,0,0.2)",
        fontSize: 12,
        fontStyle: "italic",
        opacity: 0.8,
      }}
    >
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// shared primitives
// ─────────────────────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section>
      <h3
        style={{
          margin: "0 0 4px 0",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          opacity: 0.65,
          fontWeight: 600,
        }}
      >
        {label}
      </h3>
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{children}</div>
    </section>
  );
}

function ConfidenceBadge({ value }: { value: number }): React.ReactElement {
  const v = Math.max(0, Math.min(1, value));
  const band: { label: string; bg: string } =
    v >= 0.8
      ? { label: "high", bg: "rgba(56,142,60,0.18)" }
      : v >= 0.5
        ? { label: "med", bg: "rgba(192,138,58,0.18)" }
        : { label: "low", bg: "rgba(0,0,0,0.08)" };
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: 4,
        padding: "0 6px",
        fontSize: 10,
        background: band.bg,
        verticalAlign: "middle",
      }}
      title={`${(v * 100).toFixed(0)}% confidence`}
    >
      {band.label}
    </span>
  );
}

function CopyableDraft({ text }: { text: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          padding: "6px 8px",
          background: "rgba(0,0,0,0.04)",
          borderLeft: "3px solid rgba(0,0,0,0.2)",
          fontSize: 13,
          whiteSpace: "pre-wrap",
          maxHeight: 160,
          overflowY: "auto",
        }}
      >
        {text}
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="neurodock-button"
        style={{
          marginTop: 4,
          padding: "2px 8px",
          fontSize: 11,
        }}
        aria-label="Copy draft to clipboard"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function UnknownToolFallback({
  data,
}: {
  data: Record<string, unknown>;
}): React.ReactElement {
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        margin: 0,
        maxHeight: 200,
        overflow: "auto",
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
