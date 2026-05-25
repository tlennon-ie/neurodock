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
 * - `google`     : cloud-mode provider via Google's OpenAI-compatible
 *                  Gemini endpoint. Default model is `gemini-2.0-flash`.
 * - `mock`       : developer-only deterministic provider.
 */
export type ProviderId =
  | "ollama"
  | "lmstudio"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "google"
  | "mock";

export type TranslationTool =
  | "translate_incoming"
  | "check_tone"
  | "rewrite_outgoing"
  | "brief_meeting"
  | "describe_image";

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

/**
 * Self-ID neurotypes mirroring the `identity.neurotypes` enum in
 * `packages/core/schemas/profile.schema.json`. The user may select any
 * combination. AuDHD is first-class — when the user has both `adhd` and
 * `asd` separately we substitute the fused AuDHD addendum at prompt
 * build time rather than concatenating both (per the 2026-05-24
 * neurotype-tailoring report).
 */
export type Neurotype =
  | "adhd"
  | "asd"
  | "audhd"
  | "ocd"
  | "dyslexia"
  | "dyspraxia"
  | "tourette"
  | "other";

/**
 * How the user wants the AI to structure free-text answers. Mirrors
 * `preferences.output_format` in the profile schema.
 *
 *   - answer_first: lead with the headline verdict; reasoning after.
 *   - conventional: explanation first, then verdict.
 *   - bullet_first: lead with a bullet list before any prose.
 */
export type OutputFormat = "answer_first" | "conventional" | "bullet_first";

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
  /**
   * 0.0.27: per-provider API keys, keyed by provider id ("anthropic",
   * "openai", "openrouter", "google"). Pre-0.0.27 the extension stored
   * one `cloudApiKey` shared across all cloud providers — toggling from
   * OpenRouter to Google in Settings showed the OpenRouter key under
   * Google's label, which was both a privacy footgun and a UX trap.
   *
   * The legacy `cloudApiKey` is preserved as a denormalised pointer to
   * the *active* provider's key for back-compat with code paths that
   * still read it directly. `cloudApiKeys` is the canonical store.
   *
   * Keys persist to `chrome.storage.local` only — same trust boundary
   * as the rest of the profile.
   */
  readonly cloudApiKeys: Readonly<Record<string, string>>;
  readonly historyEnabled: boolean;
  readonly displayName: string;
  /**
   * 0.0.22: per-neurotype prompt tailoring. Empty array = no tailoring
   * (the base prompt is sent unchanged). Read from `identity.neurotypes`
   * on the on-disk yaml; configurable via the Settings tab when no
   * native host is installed.
   */
  readonly neurotypes: readonly Neurotype[];
  /**
   * 0.0.22: how the AI should structure free-text fields. Threaded into
   * every prompt at build time so the model sees it before responding.
   * Mirrors `preferences.output_format` on the on-disk profile.
   */
  readonly outputFormat: OutputFormat;
  /**
   * 0.0.22: per-list item cap injected into per-neurotype addenda
   * (`{max_chunk_size}` placeholder). 1..20, default 5. Mirrors
   * `preferences.max_chunk_size`. The schema permits more items but the
   * prompt instructs the model to stop at this count.
   */
  readonly maxChunkSize: number;
  /**
   * 0.0.22: free-form text the user wants the model to know. Surfaced
   * via the `other` addendum block (or always-appended footer). Never
   * sent off-device unless cloud mode is on. Mirrors
   * `identity.additional_notes`.
   */
  readonly additionalNotes: string | null;
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

/**
 * Output shape of the `describe_image` tool. REQUIRES a vision-capable
 * model — text-only models return an error with code
 * `VISION_MODEL_REQUIRED`. See `packages/mcp-translation/schemas/
 * describe_image.schema.json` for the canonical wire contract.
 */
export interface DescribeImageResult {
  readonly description: string;
  readonly contains_text: boolean;
  readonly transcribed_text: string | null;
  readonly key_elements: readonly string[];
  readonly inferred_purpose: string;
  readonly accessibility_notes: string | null;
  readonly eval_corpus_slice: string;
  readonly model_provenance: ModelProvenance;
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
  /**
   * 0.0.21: full request + response captured so the popup History tab
   * can render the actual structured result (description, subtext,
   * etc.) on click — pre-0.0.21 entries only carried short previews,
   * so the "open History to view the result" notification led to a
   * dead-end list. Optional for back-compat with rows written before
   * this field landed.
   *
   * Stored locally only — same privacy envelope as the rest of the
   * History store. Never sent off-device.
   */
  readonly request?: TranslationRequest;
  readonly response?: TranslationResponse;
}

/**
 * Discriminated union of every message that flows over the extension's
 * runtime bus. Use `msg.type` to narrow.
 *
 * Directions (informational — `chrome.runtime.sendMessage` is bidirectional):
 * - `translate`               : content script / popup → service worker.
 * - `neurodock:context-result`: service worker → tab (broadcast after a
 *                               right-click "translate selection"; the
 *                               island in the tab opens the result panel).
 * - `history:updated`         : service worker → popup (broadcast after
 *                               `appendHistory`; the popup reloads its
 *                               history list without waiting for re-open).
 */
export type RuntimeMessage =
  | { readonly type: "translate"; readonly request: TranslationRequest }
  | {
      readonly type: "neurodock:context-result";
      readonly response: TranslationResponse;
      /** Original selection text the user right-clicked; shown alongside the panel. */
      readonly sourceText: string;
      /** Channel detected from the tab's URL, so the panel header can label it. */
      readonly channel: Channel | null;
    }
  | { readonly type: "history:updated" }
  /**
   * Content-script island asks the service worker for the current profile.
   * Pre-0.0.8 this message had no handler — islands silently fell through
   * to `defaultProfile()`, so the in-page cloud-mode banner reflected
   * defaults instead of the user's actual settings (privacy-transparency
   * bug). See [bootstrap.tsx] for the caller.
   */
  | { readonly type: "profile:get" }
  /**
   * 0.0.16: popup asks the service worker to fetch the model list from
   * the configured provider. The popup itself runs in the
   * `chrome-extension://...` origin where cross-origin fetches face CORS
   * — local LLM endpoints like LM Studio's `http://localhost:1234/v1`
   * do NOT send `Access-Control-Allow-Origin`, so the direct fetch
   * fails. The service worker has `host_permissions` for those origins
   * and bypasses CORS, so we proxy through it.
   */
  | {
      readonly type: "models:fetch";
      readonly provider:
        | "ollama"
        | "lmstudio"
        | "openai"
        | "openrouter"
        | "anthropic"
        | "google";
      readonly baseUrl?: string | null;
      readonly apiKey?: string | null;
    }
  /**
   * 0.0.20: SW asks the content-script island to snapshot a right-clicked
   * image into a base64 PNG data URL. Used as a robust fallback when the
   * direct image URL is unreachable (auth-required CDN, expired hotlink),
   * is in a format vision models can't read (SVG), or when the URL fetch
   * round-trip would be wasteful (the browser already has the bytes in
   * memory because the image is rendered on the page).
   *
   * The content script locates the `<img>` element matching `imageUrl`
   * (via `currentSrc` / `src`), draws it onto an offscreen canvas, and
   * returns `toDataURL('image/png')`. Returns null when:
   *   - no matching `<img>` is found on the page
   *   - the image isn't yet loaded (`naturalWidth === 0`)
   *   - the canvas is cross-origin tainted (`toDataURL` throws
   *     `SecurityError`) — common when the image was served without a
   *     CORS header and the `<img>` has no `crossorigin="anonymous"`
   *
   * Null on either side is non-fatal: the SW falls back to the
   * original-URL fetch path so the existing behaviour is preserved.
   */
  | { readonly type: "image:snapshot"; readonly imageUrl: string };

export interface RuntimeResponseEnvelope<T = unknown> {
  readonly success: boolean;
  readonly data: TranslationResponse<T> | null;
  readonly error: string | null;
}
