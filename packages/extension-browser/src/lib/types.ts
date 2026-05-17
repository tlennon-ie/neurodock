/**
 * Extension-internal types.
 *
 * The wire contracts for translation requests/responses are defined by
 * packages/mcp-translation/schemas/*.schema.json. These TypeScript types
 * are NOT a replacement for those schemas — they are convenience surfaces
 * for the popup, content scripts, and service worker. Ajv validates the
 * actual responses against the JSON Schema at runtime in
 * translation-client.ts so we never trust a model response unchecked.
 */

export type ExtensionMode = "local" | "cloud";

export type TranslationTool =
  | "translate_incoming"
  | "check_tone"
  | "rewrite_outgoing"
  | "brief_meeting";

export type Channel =
  | "email"
  | "slack"
  | "linear"
  | "github"
  | "notion"
  | "gdocs"
  | "outlook"
  | "generic";

export type TargetRegister =
  | "direct"
  | "warm"
  | "formal"
  | "concise"
  | "clarifying";

export interface ExtensionProfile {
  readonly mode: ExtensionMode;
  readonly localEndpoint: string;
  readonly localModel: string;
  readonly cloudProvider: string | null;
  readonly cloudModel: string | null;
  readonly historyEnabled: boolean;
  readonly displayName: string;
}

export interface ModelProvenance {
  readonly mode: "local" | "cloud" | "unknown";
  readonly provider: string;
  readonly model: string;
}

export interface AmbiguitySpan {
  readonly start_char: number;
  readonly end_char: number;
  readonly reason: string;
  readonly note: string | null;
}

export interface SubtextHypothesis {
  readonly text: string;
  readonly confidence: number;
}

export interface NextAction {
  readonly action: string;
  readonly reason: string;
  readonly draft_reply: string | null;
}

export interface TranslateIncomingResult {
  readonly explicit_ask: string | null;
  readonly likely_subtext: readonly SubtextHypothesis[];
  readonly ambiguity: {
    readonly detected: boolean;
    readonly spans: readonly AmbiguitySpan[];
  };
  readonly recommended_next_action: NextAction;
  readonly eval_corpus_slice: string;
  readonly model_provenance: ModelProvenance;
}

export interface TranslationRequest {
  readonly tool: TranslationTool;
  readonly input: Record<string, unknown>;
  readonly channel?: Channel;
}

export interface TranslationResponse<T = unknown> {
  readonly ok: boolean;
  readonly tool: TranslationTool;
  readonly data: T | null;
  readonly error: string | null;
  readonly mockMode: boolean;
  readonly provenance: ModelProvenance;
  readonly timestamp: string;
}

export interface HistoryEntry {
  readonly id: string;
  readonly tool: TranslationTool;
  readonly channel: Channel | null;
  readonly timestamp: string;
  readonly mode: ExtensionMode;
  readonly mockMode: boolean;
  // We never persist the input text or output text to history unless the user
  // has explicitly enabled detailed history. v0.0.1 stores only the metadata
  // shape so the local index is useful but air-gap-safe.
  readonly inputPreview: string;
  readonly outputSummary: string;
}

export interface RuntimeMessage {
  readonly type: "translate";
  readonly request: TranslationRequest;
}

export interface RuntimeResponseEnvelope<T = unknown> {
  readonly success: boolean;
  readonly data: TranslationResponse<T> | null;
  readonly error: string | null;
}
