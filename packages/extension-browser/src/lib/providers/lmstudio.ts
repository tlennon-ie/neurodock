/**
 * LM Studio provider.
 *
 * Targets LM Studio's local OpenAI-compatible API. By default LM Studio
 * exposes `http://localhost:1234/v1` and accepts the OpenAI Chat
 * Completions request shape (`POST {baseUrl}/chat/completions`,
 * `stream: true` for SSE). No API key is required by default because the
 * server is local and unauthenticated, but an optional `apiKey` is
 * accepted for users running LM Studio behind a reverse proxy.
 *
 * Streaming follows the same SSE format as OpenRouter — each event line
 * is `data: {choices: [{delta: {content: "..."}}]}` ending with
 * `data: [DONE]`. We fall back to a non-streaming POST if the response
 * is not an event stream.
 *
 * Errors throw with a normalised `LMSTUDIO_*` prefix so the popup can
 * surface a friendly message.
 *
 * v0.0.4 adds `LMSTUDIO_PERMISSION_REQUIRED` so non-localhost users get
 * an actionable error instead of the opaque CSP-blocked "Failed to fetch".
 * The check is delegated via the optional `hasPermission` callback so the
 * provider remains decoupled from the chrome.permissions API and remains
 * unit-testable.
 *
 * Docs: https://lmstudio.ai/docs/api/openai-api
 */
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";

export interface LMStudioOptions {
  readonly baseUrl: string;
  readonly apiKey?: string | null;
  readonly fetchImpl?: typeof fetch;
  readonly disableStreaming?: boolean;
  /**
   * Optional permission probe. Called before any fetch. When provided and
   * the probe returns `false`, the provider throws
   * `LMSTUDIO_PERMISSION_REQUIRED` instead of attempting a fetch that
   * would be blocked by the host_permissions gate.
   *
   * In production this is wired to `hasHostPermission` from
   * `src/lib/permissions.ts`. Tests can stub it directly.
   */
  readonly hasPermission?: (baseUrl: string) => Promise<boolean>;
}

export const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";

/**
 * LM Studio's OpenAI-compatible API lives under `/v1`. The Settings UI
 * surfaces the full URL (`http://host:1234/v1`) as the default and the
 * docs are explicit about it, but users routinely paste in just
 * `http://localhost:1234` from LM Studio's "Server running at" banner.
 *
 * Without `/v1`, the resulting `POST /chat/completions` hits LM Studio's
 * root router. Recent LM Studio versions answer that with HTTP 200 and a
 * "Unexpected endpoint or method" body, which our SSE parser silently
 * turns into an empty string — and the Test button cheerfully reports
 * "OK — got 0 chars back". Several hours of confused users later, the
 * fix is to defensively normalise the base URL.
 *
 * Rules:
 *  - strip trailing slashes
 *  - if the path component does not already end in `/v1` (any case), append it
 *  - leave anything past `/v1` alone (e.g. `/v1/openai/` would be exotic but
 *    if a user typed it, respect them)
 */
export function normaliseLMStudioBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) return LMSTUDIO_DEFAULT_BASE_URL;
  try {
    const u = new URL(trimmed);
    if (!/\/v1$/i.test(u.pathname)) {
      u.pathname = `${u.pathname.replace(/\/+$/, "")}/v1`;
    }
    // Drop trailing slash again in case URL re-introduced one.
    return u.toString().replace(/\/+$/, "");
  } catch {
    // Bare strings without a scheme fall through to a string append.
    return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
  }
}

export function createLMStudioProvider(options: LMStudioOptions): Provider {
  const baseUrl = normaliseLMStudioBaseUrl(
    options.baseUrl || LMSTUDIO_DEFAULT_BASE_URL,
  );
  const apiKey = options.apiKey ?? null;
  const f = options.fetchImpl ?? fetch.bind(globalThis);

  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey && apiKey.length > 0) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  async function ensurePermitted(): Promise<void> {
    if (!options.hasPermission) return;
    const allowed = await options.hasPermission(baseUrl);
    if (!allowed) {
      throw new Error(
        `LMSTUDIO_PERMISSION_REQUIRED: Grant permission for ${originOf(
          baseUrl,
        )} first. Click 'Test connection' to trigger the prompt.`,
      );
    }
  }

  async function postOnce(
    request: ProviderRequest,
    stream: boolean,
  ): Promise<Response> {
    await ensurePermitted();
    const url = `${baseUrl}/chat/completions`;
    // LM Studio's OpenAI-compat API rejects response_format.type === 'json_object'
    // (returns HTTP 400 "must be 'json_schema' or 'text'"). The translation
    // prompts already instruct the model to return JSON, and validation.ts'
    // extractJson handles raw-text responses, so 'text' is correct here.
    // OpenAI/OpenRouter keep 'json_object' in their own provider files.
    //
    // 0.0.15: when `images` is non-empty, build the OpenAI-compatible
    // multimodal content array. LM Studio routes this to whatever the
    // loaded model accepts — for vision-capable models (LLaVA-family,
    // MiniCPM-V, Qwen2-VL, etc.) it works; for text-only models LM
    // Studio responds with an HTTP 400 the user can act on. We do NOT
    // gate on a model-name allowlist here because LM Studio model slugs
    // are user-chosen and don't follow a stable naming convention.
    const content =
      request.images && request.images.length > 0
        ? [
            { type: "text", text: request.prompt },
            ...request.images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ]
        : request.prompt;
    const body = JSON.stringify({
      model: request.model,
      messages: [{ role: "user", content }],
      stream,
      response_format: { type: "text" },
    });
    let res: Response;
    try {
      res = await f(url, {
        method: "POST",
        headers: buildHeaders(),
        body,
        signal: request.signal,
      });
    } catch (cause: unknown) {
      throw new Error(
        `LMSTUDIO_UNREACHABLE: ${baseUrl} did not respond. ` +
          `Is LM Studio running and serving? (${getErrorMessage(cause)})`,
      );
    }
    if (!res.ok) {
      const detail = await readErrorBody(res);
      throw normaliseLMStudioError(res.status, detail);
    }
    return res;
  }

  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    if (options.disableStreaming === true) {
      return completeNonStreaming(request);
    }
    try {
      const res = await postOnce(request, true);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.toLowerCase().includes("text/event-stream")) {
        const text = await consumeNonStreamBody(res, request.onToken);
        return resultFor(request, text);
      }
      const text = await consumeSse(res, request.onToken);
      return resultFor(request, text);
    } catch (cause: unknown) {
      if (cause instanceof Error && /LMSTUDIO_/.test(cause.message)) {
        throw cause;
      }
      if (isStreamUnsupported(cause)) {
        return completeNonStreaming(request);
      }
      throw normaliseLMStudioError(0, getErrorMessage(cause));
    }
  }

  function originOf(url: string): string {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return url;
    }
  }

  async function completeNonStreaming(
    request: ProviderRequest,
  ): Promise<ProviderResult> {
    const res = await postOnce(request, false);
    const text = await consumeNonStreamBody(res, request.onToken);
    return resultFor(request, text);
  }

  return { id: "lmstudio", complete };
}

/**
 * Fetch the available models from an LM Studio server. Hits
 * `GET {baseUrl}/models` (OpenAI-compatible) and returns the list of
 * model ids. Throws on network failure or non-2xx response so the caller
 * can surface a friendly error.
 */
export async function fetchLMStudioModels(options: {
  readonly baseUrl: string;
  readonly apiKey?: string | null;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly hasPermission?: (baseUrl: string) => Promise<boolean>;
}): Promise<string[]> {
  const baseUrl = normaliseLMStudioBaseUrl(
    options.baseUrl || LMSTUDIO_DEFAULT_BASE_URL,
  );
  if (options.hasPermission) {
    const allowed = await options.hasPermission(baseUrl);
    if (!allowed) {
      const o = (() => {
        try {
          const u = new URL(baseUrl);
          return `${u.protocol}//${u.host}`;
        } catch {
          return baseUrl;
        }
      })();
      throw new Error(
        `LMSTUDIO_PERMISSION_REQUIRED: Grant permission for ${o} first. ` +
          `Click 'Test connection' to trigger the prompt.`,
      );
    }
  }
  const f = options.fetchImpl ?? fetch.bind(globalThis);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.apiKey && options.apiKey.length > 0) {
    headers["Authorization"] = `Bearer ${options.apiKey}`;
  }
  let res: Response;
  try {
    res = await f(`${baseUrl}/models`, {
      method: "GET",
      headers,
      signal: options.signal,
    });
  } catch (cause: unknown) {
    throw new Error(
      `LMSTUDIO_UNREACHABLE: ${baseUrl} did not respond. (${getErrorMessage(
        cause,
      )})`,
    );
  }
  if (!res.ok) {
    const detail = await readErrorBody(res);
    throw normaliseLMStudioError(res.status, detail);
  }
  const raw = await res.text();
  try {
    const obj = JSON.parse(raw) as { data?: Array<{ id?: unknown }> };
    if (!obj.data) return [];
    return obj.data
      .map((m) => (typeof m.id === "string" ? m.id : null))
      .filter((id): id is string => id !== null && id.length > 0);
  } catch {
    return [];
  }
}

function resultFor(request: ProviderRequest, text: string): ProviderResult {
  return {
    text,
    provenance: {
      mode: "local",
      provider: "lmstudio",
      model: request.model,
    },
  };
}

async function consumeSse(
  response: Response,
  onToken?: (delta: string) => void,
): Promise<string> {
  if (!response.body) {
    const raw = await response.text();
    return aggregateSseString(raw, onToken);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const delta = parseSseLine(line);
      if (delta.length > 0) {
        out += delta;
        onToken?.(delta);
      }
    }
  }
  if (buffer.length > 0) {
    const delta = parseSseLine(buffer);
    if (delta.length > 0) {
      out += delta;
      onToken?.(delta);
    }
  }
  return out;
}

function aggregateSseString(
  raw: string,
  onToken?: (delta: string) => void,
): string {
  let out = "";
  for (const line of raw.split("\n")) {
    const delta = parseSseLine(line);
    if (delta.length > 0) {
      out += delta;
      onToken?.(delta);
    }
  }
  return out;
}

function parseSseLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "";
  if (!trimmed.startsWith("data:")) return "";
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return "";
  try {
    const obj = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: unknown } }>;
    };
    const delta = obj.choices?.[0]?.delta?.content;
    if (typeof delta === "string") return delta;
    return "";
  } catch {
    return "";
  }
}

async function consumeNonStreamBody(
  response: Response,
  onToken?: (delta: string) => void,
): Promise<string> {
  const raw = await response.text();
  try {
    const obj = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = obj.choices?.[0]?.message?.content;
    if (typeof text === "string") {
      if (text.length > 0) onToken?.(text);
      return text;
    }
  } catch {
    const fallback = aggregateSseString(raw, onToken);
    if (fallback.length > 0) return fallback;
  }
  return "";
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const raw = await response.text();
    try {
      const obj = JSON.parse(raw) as {
        error?: { message?: unknown };
      };
      const msg = obj.error?.message;
      if (typeof msg === "string" && msg.length > 0) return msg;
    } catch {
      // fall through
    }
    return raw.slice(0, 240);
  } catch {
    return "";
  }
}

function isStreamUnsupported(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return /event-stream|stream not supported/i.test(cause.message);
}

function normaliseLMStudioError(status: number, detail: string): Error {
  if (status === 401 || /invalid.*api.*key|unauthor/i.test(detail)) {
    return new Error(
      "LMSTUDIO_AUTH_FAILED: LM Studio key was rejected. Check Settings.",
    );
  }
  if (status === 404 || /model.*not.*found|no such model/i.test(detail)) {
    return new Error(
      `LMSTUDIO_MODEL_NOT_FOUND: ${detail || "model not loaded"}. ` +
        "Load the model in LM Studio's Server tab.",
    );
  }
  const prefix = status > 0 ? `LMSTUDIO_HTTP_${status}` : "LMSTUDIO_ERROR";
  const body = detail.length > 0 ? `: ${detail}` : "";
  return new Error(`${prefix}${body}`);
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "unknown error";
}
