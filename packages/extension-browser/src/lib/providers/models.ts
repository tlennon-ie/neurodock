/**
 * Model-list fetching.
 *
 * Each provider that exposes a "list models" endpoint gets a fetcher here.
 * The Settings tab calls these to populate a dropdown so users do not have
 * to type model slugs from memory. Errors throw with a `<PROVIDER>_*`
 * prefix matching the streaming providers so the UI can show a single
 * friendly message.
 *
 * Endpoints:
 *
 * - Ollama:     GET {baseUrl}/api/tags          -> { models: [{ name }] }
 * - LM Studio:  GET {baseUrl}/models            -> { data:   [{ id   }] }
 * - OpenAI:     GET https://api.openai.com/v1/models with Bearer key
 *                                               -> { data:   [{ id   }] }
 * - OpenRouter: GET https://openrouter.ai/api/v1/models with Bearer key
 *                                               -> { data:   [{ id   }] }
 *               (we always prepend `openrouter/auto` so the auto-router
 *               is selectable even if the listing omits it).
 * - Google:     GET https://generativelanguage.googleapis.com/v1beta/openai/models
 *               with Bearer key                  -> { data:   [{ id   }] }
 *               (OpenAI-compatible shape; `models/` prefix is stripped).
 * - Anthropic:  no models endpoint exists. We return a hardcoded list of
 *               the currently supported Claude models. Refreshing for
 *               Anthropic requires a code bump.
 */
import type { ProviderId } from "../types.js";
import { fetchLMStudioModels } from "./lmstudio.js";
import { fetchGoogleModels } from "./google.js";

export type ModelFetchableProvider =
  | "ollama"
  | "lmstudio"
  | "openai"
  | "openrouter"
  | "anthropic"
  | "google";

export interface FetchModelsContext {
  readonly provider: ModelFetchableProvider;
  readonly baseUrl?: string | null;
  readonly apiKey?: string | null;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/**
 * Hardcoded fallback for Anthropic. Anthropic does not publish a public
 * `/v1/models` endpoint, so we keep the supported list in code. Update
 * this constant when a new model is released and ship a new extension
 * version.
 */
export const ANTHROPIC_KNOWN_MODELS: readonly string[] = Object.freeze([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-haiku-4-5",
]);

/**
 * Dispatch to the right provider's model fetcher. Always returns a fresh
 * array (caller may mutate). Throws on network or auth failure with a
 * normalised error prefix.
 */
export async function fetchModels(
  context: FetchModelsContext,
): Promise<string[]> {
  if (context.provider === "anthropic") {
    return [...ANTHROPIC_KNOWN_MODELS];
  }
  if (context.provider === "ollama") {
    return fetchOllamaModels({
      baseUrl: context.baseUrl ?? "http://localhost:11434",
      ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
  }
  if (context.provider === "lmstudio") {
    return fetchLMStudioModels({
      baseUrl: context.baseUrl ?? "http://localhost:1234/v1",
      apiKey: context.apiKey ?? null,
      ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
  }
  if (context.provider === "openai") {
    return fetchOpenAIModels({
      apiKey: context.apiKey ?? "",
      ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
  }
  if (context.provider === "openrouter") {
    return fetchOpenRouterModels({
      apiKey: context.apiKey ?? "",
      ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
  }
  if (context.provider === "google") {
    return fetchGoogleModels({
      apiKey: context.apiKey ?? "",
      ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
  }
  return [];
}

export async function fetchOllamaModels(options: {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<string[]> {
  const f = options.fetchImpl ?? fetch.bind(globalThis);
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await f(`${baseUrl}/api/tags`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (cause: unknown) {
    throw new Error(
      `OLLAMA_UNREACHABLE: ${baseUrl} did not respond. (${getErrorMessage(
        cause,
      )})`,
    );
  }
  if (!res.ok) {
    throw new Error(`OLLAMA_HTTP_${res.status}: ${res.statusText}`);
  }
  const raw = await res.text();
  try {
    const obj = JSON.parse(raw) as {
      models?: Array<{ name?: unknown; model?: unknown }>;
    };
    if (!obj.models) return [];
    return obj.models
      .map((m) => {
        if (typeof m.name === "string") return m.name;
        if (typeof m.model === "string") return m.model;
        return null;
      })
      .filter((name): name is string => name !== null && name.length > 0);
  } catch {
    return [];
  }
}

export async function fetchOpenAIModels(options: {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<string[]> {
  if (options.apiKey.length === 0) {
    throw new Error(
      "OPENAI_API_KEY_MISSING: Set an OpenAI API key in Settings.",
    );
  }
  const f = options.fetchImpl ?? fetch.bind(globalThis);
  let res: Response;
  try {
    res = await f("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      signal: options.signal,
    });
  } catch (cause: unknown) {
    throw new Error(
      `OPENAI_UNREACHABLE: api.openai.com did not respond. (${getErrorMessage(
        cause,
      )})`,
    );
  }
  if (res.status === 401) {
    throw new Error(
      "OPENAI_AUTH_FAILED: API key was rejected. Check Settings.",
    );
  }
  if (!res.ok) {
    throw new Error(`OPENAI_HTTP_${res.status}: ${res.statusText}`);
  }
  const raw = await res.text();
  try {
    const obj = JSON.parse(raw) as { data?: Array<{ id?: unknown }> };
    if (!obj.data) return [];
    const ids = obj.data
      .map((m) => (typeof m.id === "string" ? m.id : null))
      .filter((id): id is string => id !== null && id.length > 0);
    // Prefer chat-completion-eligible models when we can identify them
    // by prefix; otherwise return the full list so users are not blocked
    // by an over-zealous filter.
    const chatLike = ids.filter((id) => /^(gpt-|o1|o3|chatgpt-)/i.test(id));
    return chatLike.length > 0 ? chatLike : ids;
  } catch {
    return [];
  }
}

export async function fetchOpenRouterModels(options: {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<string[]> {
  if (options.apiKey.length === 0) {
    throw new Error(
      "OPENROUTER_API_KEY_MISSING: Set an OpenRouter API key in Settings.",
    );
  }
  const f = options.fetchImpl ?? fetch.bind(globalThis);
  let res: Response;
  try {
    res = await f("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.apiKey}`,
        "HTTP-Referer": "https://neurodock.org",
        "X-Title": "NeuroDock",
      },
      signal: options.signal,
    });
  } catch (cause: unknown) {
    throw new Error(
      `OPENROUTER_UNREACHABLE: openrouter.ai did not respond. (${getErrorMessage(
        cause,
      )})`,
    );
  }
  if (res.status === 401) {
    throw new Error(
      "OPENROUTER_AUTH_FAILED: OpenRouter key was rejected. Check Settings.",
    );
  }
  if (!res.ok) {
    throw new Error(`OPENROUTER_HTTP_${res.status}: ${res.statusText}`);
  }
  const raw = await res.text();
  let listed: string[] = [];
  try {
    const obj = JSON.parse(raw) as { data?: Array<{ id?: unknown }> };
    if (obj.data) {
      listed = obj.data
        .map((m) => (typeof m.id === "string" ? m.id : null))
        .filter((id): id is string => id !== null && id.length > 0);
    }
  } catch {
    listed = [];
  }
  // Always make the auto-router available even if absent from the API
  // response (it is conceptually always offered by OpenRouter).
  const filtered = listed.filter((id) => id !== "openrouter/auto");
  return ["openrouter/auto", ...filtered];
}

/**
 * Indicates whether a provider supports refreshing models from a remote
 * endpoint. Anthropic returns true here even though the list is
 * hardcoded — refreshing simply re-reads the constant.
 */
export function supportsModelRefresh(provider: ProviderId): boolean {
  return (
    provider === "ollama" ||
    provider === "lmstudio" ||
    provider === "openai" ||
    provider === "openrouter" ||
    provider === "anthropic" ||
    provider === "google"
  );
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "unknown error";
}
