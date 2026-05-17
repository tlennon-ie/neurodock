/**
 * translation-client.ts
 *
 * The single orchestration entry point for translation requests. Routes
 * between three lanes:
 *
 *   1. MOCK mode — when in local mode and the user has not configured a
 *      reachable Ollama endpoint. Returns a deterministic canned response
 *      with `mockMode: true` and `model_provenance.mode: "local"`,
 *      `provider: "mock"`. Used so v0.0.1 demos end-to-end without any
 *      LLM running.
 *
 *   2. LOCAL mode — calls the user's Ollama endpoint with the prompt
 *      assembled from the synced prompt library. v0.0.1 ships this lane
 *      behind an explicit opt-in (the popup must show the user that we'll
 *      try the local endpoint). When the endpoint is unreachable we fall
 *      through to MOCK with a banner explaining why.
 *
 *   3. CLOUD mode — calls the configured cloud provider. Requires an API
 *      key in extension storage. v0.0.1 documents the contract and errors
 *      loudly with `MISSING_CLOUD_KEY`; v0.0.2 wires the actual provider
 *      calls. The persistent cloud-mode banner is always shown when this
 *      lane is selected.
 *
 * Per ADR 0005 the substrate server itself does NOT call any LLM. In the
 * browser extension the equivalent boundary is: this module is the ONLY
 * place that talks to a model. Content scripts and the popup MUST go
 * through the service worker's runtime.onMessage handler so the model
 * boundary is single, auditable, and easy to swap.
 */
import type {
  Channel,
  ExtensionProfile,
  ModelProvenance,
  TranslationRequest,
  TranslationResponse,
  TranslationTool,
} from "./types.js";

const SCHEMA_VERSION = "0.1.0";

export interface TranslationClientOptions {
  readonly profile: ExtensionProfile;
  /** Override the fetch implementation (tests inject a stub). */
  readonly fetchImpl?: typeof fetch;
  /** Force mock mode regardless of profile/endpoint. Used by tests. */
  readonly forceMock?: boolean;
}

export async function translate<T = unknown>(
  request: TranslationRequest,
  options: TranslationClientOptions
): Promise<TranslationResponse<T>> {
  const { profile, forceMock } = options;
  const timestamp = new Date().toISOString();

  if (profile.mode === "cloud") {
    return translateCloud<T>(request, options, timestamp);
  }

  if (forceMock === true) {
    return mockResponse<T>(request, timestamp, "force_mock");
  }

  // Local mode. v0.0.1 always returns the labelled MOCK response unless
  // an Ollama endpoint is reachable. Real local wiring is deferred to
  // v0.0.2 because per-user provider configuration is required to do it
  // safely (requesting optional_host_permissions at runtime).
  return mockResponse<T>(request, timestamp, "local_default");
}

function translateCloud<T>(
  request: TranslationRequest,
  options: TranslationClientOptions,
  timestamp: string
): TranslationResponse<T> {
  const { profile } = options;
  if (!profile.cloudProvider || !profile.cloudModel) {
    return {
      ok: false,
      tool: request.tool,
      data: null,
      error:
        "MISSING_CLOUD_PROVIDER: Cloud mode is enabled but no provider is " +
          "configured. Open the popup and pick a provider, or switch back " +
          "to local mode.",
      mockMode: false,
      provenance: {
        mode: "cloud",
        provider: profile.cloudProvider ?? "unknown",
        model: profile.cloudModel ?? "unknown",
      },
      timestamp,
    };
  }
  return {
    ok: false,
    tool: request.tool,
    data: null,
    error:
      "CLOUD_NOT_WIRED: v0.0.1 does not call cloud providers. The " +
        "wire format and persistent banner are in place; provider " +
        "integration lands in v0.0.2.",
    mockMode: false,
    provenance: {
      mode: "cloud",
      provider: profile.cloudProvider,
      model: profile.cloudModel,
    },
    timestamp,
  };
}

function mockResponse<T>(
  request: TranslationRequest,
  timestamp: string,
  reason: "force_mock" | "local_default"
): TranslationResponse<T> {
  const provenance: ModelProvenance = {
    mode: "local",
    provider: "mock",
    model: `neurodock-mock-${SCHEMA_VERSION}`,
  };

  const data = buildMockData(request.tool, request.input, reason);
  return {
    ok: true,
    tool: request.tool,
    data: data as T,
    error: null,
    mockMode: true,
    provenance,
    timestamp,
  };
}

function buildMockData(
  tool: TranslationTool,
  input: Record<string, unknown>,
  reason: string
): Record<string, unknown> {
  const noteHeader =
    "[MOCK] This response is a deterministic placeholder. v0.0.1 does not " +
    "call any LLM. Configure local Ollama or cloud mode in the popup to " +
    `enable real translation. (reason: ${reason})`;

  const evalSlice = `packages/evals/corpora/translation/${tool.replace(
    "_",
    "/"
  )}/v0.1.0/mock.jsonl`;

  const provenance = {
    mode: "local",
    provider: "mock",
    model: `neurodock-mock-${SCHEMA_VERSION}`,
  };

  if (tool === "translate_incoming") {
    const text = typeof input.text === "string" ? input.text : "";
    return {
      explicit_ask:
        text.length > 0
          ? `${noteHeader}\n\nLiteral surface: "${text.slice(0, 200)}"`
          : null,
      likely_subtext: [
        {
          text:
            "[MOCK] Subtext analysis stub. The real model would rank likely " +
              "implicit meanings here.",
          confidence: 0.5,
        },
      ],
      ambiguity: { detected: false, spans: [] },
      recommended_next_action: {
        action: "clarify",
        reason:
          "[MOCK] Recommendation placeholder. Configure a model to receive " +
            "a real next-action suggestion.",
        draft_reply: null,
      },
      eval_corpus_slice: evalSlice,
      model_provenance: provenance,
    };
  }

  if (tool === "check_tone") {
    return {
      axes: { directness: 50, warmth: 50, urgency: 50 },
      axes_target: null,
      baseline_delta: null,
      flagged_phrases: [],
      suggested_rewrite_hint: `${noteHeader}\n\nNo rewrite hint in mock mode.`,
      eval_corpus_slice: evalSlice,
      model_provenance: provenance,
    };
  }

  if (tool === "rewrite_outgoing") {
    const text = typeof input.text === "string" ? input.text : "";
    return {
      rewritten: `${noteHeader}\n\n${text}`,
      preserved_terms: [],
      unpreserved_terms: [],
      diff_summary: "[MOCK] No rewrite performed.",
      eval_corpus_slice: evalSlice,
      model_provenance: provenance,
    };
  }

  // brief_meeting
  return {
    my_asks: [],
    others_asks: [],
    decisions: [],
    ambiguous_items: [],
    eval_corpus_slice: evalSlice,
    model_provenance: provenance,
  };
}

export function isCloudMode(profile: ExtensionProfile): boolean {
  return profile.mode === "cloud";
}

export function detectChannelFromUrl(url: string): Channel {
  if (url.includes("mail.google.com")) return "email";
  if (url.includes("outlook.")) return "email";
  if (url.includes("app.slack.com")) return "slack";
  if (url.includes("linear.app")) return "linear";
  if (url.includes("github.com")) return "github";
  if (url.includes("notion.so")) return "notion";
  if (url.includes("docs.google.com")) return "gdocs";
  return "generic";
}
