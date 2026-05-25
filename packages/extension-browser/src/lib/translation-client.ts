/**
 * translation-client.ts
 *
 * The single orchestration entry point for translation requests. Routes
 * between four lanes:
 *
 *   1. MOCK mode — explicit developer mode (profile.mode === "mock").
 *      Used so the extension works end-to-end without any LLM running,
 *      but always self-labels via `model_provenance.provider = "mock"`
 *      and `mockMode: true`. v0.0.1 used this as the default; v0.0.2
 *      makes local Ollama the default.
 *
 *   2. LOCAL mode — POSTs to the user's Ollama endpoint (default
 *      http://localhost:11434) and streams the NDJSON response. Falls
 *      back to a labelled mock with reason "endpoint_unreachable" when
 *      Ollama is not reachable so the extension never silently fails.
 *
 *   3. CLOUD-ANTHROPIC mode — uses the official @anthropic-ai/sdk
 *      against api.anthropic.com. Streams via the SDK's stream()
 *      helper. The persistent cloud-mode banner is always shown when
 *      this lane is selected.
 *
 *   4. CLOUD-OPENAI mode — uses the official `openai` SDK against
 *      api.openai.com. Streams via `stream: true` chat completions.
 *
 * Per ADR 0005 this module is the ONLY place that talks to a model.
 * Content scripts and the popup MUST go through the service worker's
 * runtime.onMessage handler so the boundary is single + auditable.
 *
 * Every response is parsed + validated against the MCP output schema
 * for the tool. Validation failures surface as
 * `LLM_OUTPUT_VALIDATION_FAILED` with the validation error list in
 * `error`; the UI shows a Retry button.
 */
import type {
  Channel,
  ExtensionProfile,
  ModelProvenance,
  TranslationRequest,
  TranslationResponse,
  TranslationTool,
} from "./types.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseAndValidate } from "./validation.js";
import type { Provider, ProviderRequest } from "./providers/provider.js";
import { createOllamaProvider } from "./providers/ollama.js";
import {
  createLMStudioProvider,
  LMSTUDIO_DEFAULT_BASE_URL,
} from "./providers/lmstudio.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOpenAIProvider } from "./providers/openai.js";
import { createOpenRouterProvider } from "./providers/openrouter.js";
import {
  createGoogleProvider,
  GOOGLE_DEFAULT_MODEL,
} from "./providers/google.js";
import { createMockProvider, buildMockData } from "./providers/mock.js";
import { hasHostPermission } from "./permissions.js";

const SCHEMA_VERSION = "0.1.0";

const DEFAULT_MODELS = {
  ollama: "llama3.2:3b",
  // LM Studio: model slug depends on what the user has loaded. We leave
  // it empty by default so the popup nudges the user toward "Refresh
  // models" rather than guessing.
  lmstudio: "",
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  // OpenRouter's auto-router picks the best model per query; users can
  // override with any OpenRouter slug (e.g. `anthropic/claude-3-5-sonnet`).
  // https://openrouter.ai/docs/guides/routing/routers/auto-router
  openrouter: "openrouter/auto",
  // Google Gemini via the OpenAI-compatible endpoint. `gemini-2.0-flash`
  // is fast, cheap, and vision-capable — fits the default tool surface.
  // https://ai.google.dev/gemini-api/docs/openai
  google: GOOGLE_DEFAULT_MODEL,
} as const;

export interface TranslationClientOptions {
  readonly profile: ExtensionProfile;
  readonly providerOverride?: Provider;
  readonly forceMock?: boolean;
  readonly onToken?: (delta: string) => void;
  readonly signal?: AbortSignal;
}

export async function translate<T = unknown>(
  request: TranslationRequest,
  options: TranslationClientOptions,
): Promise<TranslationResponse<T>> {
  const { profile, forceMock } = options;
  const timestamp = new Date().toISOString();

  if (forceMock === true || profile.mode === "mock") {
    return mockResponseFromData<T>(request, timestamp, "force_mock");
  }

  let provider: Provider;
  let model: string;
  let fallbackOnError: "endpoint_unreachable" | null = null;

  if (options.providerOverride) {
    provider = options.providerOverride;
    model = profile.cloudModel ?? profile.localModel;
  } else if (profile.mode === "cloud") {
    const cloud = resolveCloudProvider(profile);
    if (typeof cloud === "string") {
      return cloudConfigError<T>(request, profile, timestamp, cloud);
    }
    provider = cloud.provider;
    model = cloud.model;
  } else {
    const local = buildLocalProvider(profile);
    provider = local.provider;
    model = local.model;
    fallbackOnError = "endpoint_unreachable";
  }

  let providerResult;
  try {
    const images = extractImagesFromInput(request);
    const providerRequest: ProviderRequest = {
      tool: request.tool,
      // 0.0.22: pass the live profile so the prompt-builder can append
      // the per-neurotype addendum (no-op for profiles at default
      // settings — preserves the pre-0.0.22 prompt byte-for-byte).
      prompt: buildPrompt({
        tool: request.tool,
        input: request.input,
        profile,
      }),
      model,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onToken ? { onToken: options.onToken } : {}),
      ...(images.length > 0 ? { images } : {}),
    };
    providerResult = await provider.complete(providerRequest);
  } catch (cause: unknown) {
    if (fallbackOnError === "endpoint_unreachable") {
      // v0.0.4: when the local provider throws *_PERMISSION_REQUIRED,
      // do NOT fall back to a silent mock — surface the actionable error
      // so the user knows to grant the host permission from Settings.
      // 0.0.15: same for VISION_MODEL_REQUIRED — if the user picked a
      // text-only local model and tried to translate an image, falling
      // back to mock hides the actual problem (wrong model) behind a
      // generic "configured provider unreachable" banner.
      const message = getErrorMessage(cause);
      if (!/_PERMISSION_REQUIRED|VISION_MODEL_REQUIRED/.test(message)) {
        return mockResponseFromData<T>(
          request,
          timestamp,
          "endpoint_unreachable",
          message,
        );
      }
    }
    return {
      ok: false,
      tool: request.tool,
      data: null,
      error: getErrorMessage(cause),
      mockMode: false,
      provenance: {
        mode: profile.mode === "cloud" ? "cloud" : "local",
        provider:
          profile.mode === "cloud"
            ? profile.cloudProvider ?? "unknown"
            : profile.localProvider,
        model,
      },
      timestamp,
    };
  }

  const validated = parseAndValidate<T>(
    request.tool,
    providerResult.text,
    providerResult.provenance,
  );
  if (!validated.ok) {
    return {
      ok: false,
      tool: request.tool,
      data: null,
      error:
        "LLM_OUTPUT_VALIDATION_FAILED: model response did not match the " +
        "expected schema. Retry to try again. " +
        `(${validated.errors.slice(0, 3).join("; ")})`,
      mockMode: false,
      provenance: providerResult.provenance,
      timestamp,
    };
  }

  return {
    ok: true,
    tool: request.tool,
    data: validated.data,
    error: null,
    mockMode: providerResult.provenance.provider === "mock",
    provenance: providerResult.provenance,
    timestamp,
  };
}

function buildLocalProvider(profile: ExtensionProfile): {
  provider: Provider;
  model: string;
} {
  if (profile.localProvider === "lmstudio") {
    const baseUrl =
      profile.localEndpoint.length > 0 &&
      profile.localEndpoint !== "http://localhost:11434"
        ? profile.localEndpoint
        : LMSTUDIO_DEFAULT_BASE_URL;
    return {
      provider: createLMStudioProvider({
        baseUrl,
        apiKey: profile.localApiKey,
        hasPermission: hasHostPermission,
      }),
      model:
        profile.localModel.length > 0
          ? profile.localModel
          : DEFAULT_MODELS.lmstudio,
    };
  }
  return {
    provider: createOllamaProvider({
      endpoint: profile.localEndpoint,
      hasPermission: hasHostPermission,
    }),
    model:
      profile.localModel.length > 0
        ? profile.localModel
        : DEFAULT_MODELS.ollama,
  };
}

type CloudResolveError =
  | "MISSING_CLOUD_PROVIDER"
  | "MISSING_CLOUD_KEY"
  | "UNSUPPORTED_CLOUD_PROVIDER";

interface CloudResolution {
  readonly provider: Provider;
  readonly model: string;
}

function resolveCloudProvider(
  profile: ExtensionProfile,
): CloudResolution | CloudResolveError {
  if (!profile.cloudProvider) return "MISSING_CLOUD_PROVIDER";
  // 0.0.27: per-provider keys. Read `cloudApiKeys[cloudProvider]` first
  // (the canonical store); fall back to the denormalised `cloudApiKey`
  // for back-compat with anything that hasn't been re-saved since the
  // migration to per-provider storage.
  const apiKey =
    profile.cloudApiKeys[profile.cloudProvider] ?? profile.cloudApiKey;
  if (!apiKey) return "MISSING_CLOUD_KEY";

  if (profile.cloudProvider === "anthropic") {
    const model = profile.cloudModel ?? DEFAULT_MODELS.anthropic;
    return {
      provider: createAnthropicProvider({ apiKey }),
      model,
    };
  }
  if (profile.cloudProvider === "openai") {
    const model = profile.cloudModel ?? DEFAULT_MODELS.openai;
    return {
      provider: createOpenAIProvider({ apiKey }),
      model,
    };
  }
  if (profile.cloudProvider === "openrouter") {
    const model = profile.cloudModel ?? DEFAULT_MODELS.openrouter;
    return {
      provider: createOpenRouterProvider({ apiKey }),
      model,
    };
  }
  if (profile.cloudProvider === "google") {
    const model = profile.cloudModel ?? DEFAULT_MODELS.google;
    return {
      provider: createGoogleProvider({ apiKey }),
      model,
    };
  }
  return "UNSUPPORTED_CLOUD_PROVIDER";
}

function cloudConfigError<T>(
  request: TranslationRequest,
  profile: ExtensionProfile,
  timestamp: string,
  err: CloudResolveError,
): TranslationResponse<T> {
  const messages: Record<CloudResolveError, string> = {
    MISSING_CLOUD_PROVIDER:
      "MISSING_CLOUD_PROVIDER: Cloud mode is enabled but no provider is " +
      "configured. Open the popup Settings tab and pick Anthropic or " +
      "OpenAI, or switch back to local mode.",
    MISSING_CLOUD_KEY:
      "MISSING_CLOUD_KEY: Cloud mode is enabled but no API key is " +
      "stored. Open the popup Settings tab and paste your key.",
    UNSUPPORTED_CLOUD_PROVIDER:
      "UNSUPPORTED_CLOUD_PROVIDER: Only 'anthropic', 'openai', " +
      "'openrouter', and 'google' are supported. Update Settings.",
  };
  return {
    ok: false,
    tool: request.tool,
    data: null,
    error: messages[err],
    mockMode: false,
    provenance: {
      mode: "cloud",
      provider: profile.cloudProvider ?? "unknown",
      model: profile.cloudModel ?? "unknown",
    },
    timestamp,
  };
}

function mockResponseFromData<T>(
  request: TranslationRequest,
  timestamp: string,
  reason: "force_mock" | "local_default" | "endpoint_unreachable",
  detail?: string,
): TranslationResponse<T> {
  const provenance: ModelProvenance = {
    mode: "local",
    provider: "mock",
    model: `mock-stub (schema-v${SCHEMA_VERSION})`,
  };
  const data = buildMockData(request.tool, reason) as T;
  const detailSuffix = detail ? ` (${detail})` : "";
  return {
    ok: true,
    tool: request.tool,
    data,
    error:
      reason === "endpoint_unreachable"
        ? `MODEL_UNAVAILABLE: Local Ollama endpoint did not respond. ` +
          `Returning a labelled mock so the UI is not blank.${detailSuffix}`
        : null,
    mockMode: true,
    provenance,
    timestamp,
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

export function buildProviderFromProfile(
  profile: ExtensionProfile,
): { provider: Provider; model: string } | { error: string } {
  if (profile.mode === "mock") {
    return {
      provider: createMockProvider({ reason: "force_mock" }),
      model: `mock-stub (schema-v${SCHEMA_VERSION})`,
    };
  }
  if (profile.mode === "cloud") {
    const resolved = resolveCloudProvider(profile);
    if (typeof resolved === "string") return { error: resolved };
    return { provider: resolved.provider, model: resolved.model };
  }
  return buildLocalProvider(profile);
}

/**
 * Pull the image URL(s) out of the request input for multimodal tools.
 * Currently only `describe_image` carries `input.image_url` (singular);
 * if a future tool accepts multiple images we can read an array here
 * without changing the provider surface.
 */
function extractImagesFromInput(request: TranslationRequest): string[] {
  if (request.tool !== "describe_image") return [];
  const url = request.input.image_url;
  if (typeof url !== "string" || url.length === 0) return [];
  return [url];
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "Unexpected error";
}

export const DEFAULTS = DEFAULT_MODELS;

export type { TranslationRequest, TranslationResponse, TranslationTool };
