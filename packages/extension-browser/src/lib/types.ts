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

export type ExtensionMode = "local" | "cloud" | "mock";

/**
 * Concrete provider identifier. Used in the Settings tab and stored in
 * `chrome.storage.local` (never `sync` — credentials are device-local).
 *
 * - `ollama`     : local-mode HTTP provider (default).
 * - `lmstudio`   : local-mode OpenAI-compatible provider for LM Studio
 *                  (default endpoint `http://localhost:1234/v1`).
 * - `anthropic`  : cloud-mode provider via @anthropic-ai/sdk.
 * - `openai`     : cloud-mode provider via the official `openai` package.
 * - `openrouter` : cloud-mode provider via OpenRouter's OpenAI-compatible
 *                  API. Default model is `openrouter/auto` (auto-router).
 * - `mock`       : developer-only deterministic provider.
 */
export type ProviderId =
  | "ollama"
  | "lmstudio"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "mock";

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
  /**
   * Which local provider to use when `mode === "local"`. Defaults to
   * `ollama` for backwards compatibility. `lmstudio` routes the local
   * lane to LM Studio's OpenAI-compatible API instead.
   */
  readonly localProvider: "ollama" | "lmstudio";
  readonly localEndpoint: string;
  readonly localModel: string;
  /**
   * Optional API key for LM Studio when running behind a reverse proxy
   * that requires auth. The default LM Studio server is unauthenticated
   * so this is typically null.
   */
  readonly localApiKey: string | null;
  readonly cloudProvider: string | null;
  readonly cloudModel: string | null;
  /**
   * Cloud-provider API key. Stored in `chrome.storage.local` only — never
   * `chrome.storage.sync` (no cross-device credential sync).
   *
   * The Settings tab masks the field after save: once a key is stored the
   * popup shows a redacted preview ("••••last4") and offers "Replace" /
   * "Clear" controls. The plaintext key is never rendered back to the DOM.
   */
  readonly cloudApiKey: string | null;
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
  /**
   * The provider that actually answered. Mirrors `ModelProvenance.provider`
   * so the popup can distinguish "user picked Mock" from "user picked
   * Ollama but Ollama was unreachable, fell back to mock". Optional for
   * backwards compatibility with entries written before this field
   * existed; missing means "unknown".
   */
  readonly provider?: string;
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
