/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
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
import { logPromptIfEnabled } from "./debug-log.js";
import { modelFacingSchema } from "../validation.js";

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
    useJsonSchema: boolean,
  ): Promise<Response> {
    await ensurePermitted();
    await logPromptIfEnabled({
      provider: "lmstudio",
      model: request.model,
      tool: request.tool,
      prompt: request.prompt,
    });
    const url = `${baseUrl}/chat/completions`;
    // 0.0.38: request grammar-constrained structured output via
    // `response_format.type === 'json_schema'` — LM Studio's native mode
    // (backed by llama.cpp GBNF). Plain 'text' left weak local models
    // (gemma-4-e4b) free to emit prose, so extractJson found no object and
    // every call failed LLM_OUTPUT_VALIDATION_FAILED. `json_object` is NOT
    // an option — LM Studio 400s on it ("must be 'json_schema' or 'text'");
    // json_schema is exactly what that error points to. We send a
    // model-facing schema (server-owned fields stripped) so a `strict`
    // grammar can't force the model to invent provenance. `useJsonSchema`
    // is flipped to false on the one-shot retry below when an older server
    // or a model without grammar support rejects it.
    //
    // 0.0.16: when `images` is non-empty, build the OpenAI-compatible
    // multimodal content array AND convert every image URL to a base64
    // data URL first. LM Studio's vision models reject http(s) URLs with
    // `'url' field must be a base64 encoded image` even though the
    // wider OpenAI spec accepts URLs. We fetch the image in the service
    // worker (where host_permissions bypass CORS), convert to base64,
    // and send as `data:` URL. Reuses request.signal so cancellation
    // propagates.
    let content: unknown = request.prompt;
    if (request.images && request.images.length > 0) {
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      > = [{ type: "text", text: request.prompt }];
      for (const imageUrl of request.images) {
        const dataUrl = await fetchAsDataUrl(f, imageUrl, request.signal);
        parts.push({ type: "image_url", image_url: { url: dataUrl } });
      }
      content = parts;
    }
    // 0.0.22: explicit `max_tokens` so big images don't get a 6-line
    // truncated JSON response. LM Studio's default cap on most installs
    // is 256 tokens, which is enough for short text responses but trips
    // the JSON parser mid-array for image descriptions
    // (`Expected ',' or ']' after array element in JSON at position N`).
    // 4096 leaves comfortable headroom for the largest schema we ship
    // (describe_image with 7 key_elements + transcribed_text) without
    // blowing model context windows.
    const responseFormat = useJsonSchema
      ? {
          type: "json_schema" as const,
          json_schema: {
            name: request.tool,
            strict: true,
            schema: modelFacingSchema(request.tool),
          },
        }
      : { type: "text" as const };
    const body = JSON.stringify({
      model: request.model,
      messages: [{ role: "user", content }],
      stream,
      response_format: responseFormat,
      max_tokens: 4096,
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
      // Some servers/models don't support structured output. Detect a 400
      // that names response_format / json_schema and let the caller retry
      // once in plain-text mode. Mirrors the OpenRouter + Google providers.
      if (
        res.status === 400 &&
        useJsonSchema &&
        isStructuredOutputRejection(detail)
      ) {
        throw new ResponseFormatRejected(detail);
      }
      throw normaliseLMStudioError(res.status, detail);
    }
    return res;
  }

  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    if (options.disableStreaming === true) {
      return completeNonStreaming(request);
    }
    try {
      const res = await postOnce(request, true, true);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.toLowerCase().includes("text/event-stream")) {
        const text = await consumeNonStreamBody(res, request.onToken);
        return resultFor(request, text);
      }
      const text = await consumeSse(res, request.onToken);
      return resultFor(request, text);
    } catch (cause: unknown) {
      if (cause instanceof ResponseFormatRejected) {
        // Retry once on the streaming path in plain-text mode.
        const res = await postOnce(request, true, false);
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().includes("text/event-stream")) {
          const text = await consumeNonStreamBody(res, request.onToken);
          return resultFor(request, text);
        }
        const text = await consumeSse(res, request.onToken);
        return resultFor(request, text);
      }
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
    try {
      const res = await postOnce(request, false, true);
      const text = await consumeNonStreamBody(res, request.onToken);
      return resultFor(request, text);
    } catch (cause: unknown) {
      if (cause instanceof ResponseFormatRejected) {
        const res = await postOnce(request, false, false);
        const text = await consumeNonStreamBody(res, request.onToken);
        return resultFor(request, text);
      }
      throw cause;
    }
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

/**
 * Sentinel raised by `postOnce` when LM Studio rejects our structured-
 * output request with a 400 that names `response_format` / `json_schema`.
 * The caller retries once in plain-text mode. Same pattern as the
 * OpenRouter and Google providers.
 */
class ResponseFormatRejected extends Error {
  constructor(detail: string) {
    super(`LMSTUDIO_STRUCTURED_OUTPUT_REJECTED: ${detail}`);
    this.name = "ResponseFormatRejected";
  }
}

function isStructuredOutputRejection(detail: string): boolean {
  // Matches messages like "must be 'json_schema' or 'text'", "this model
  // does not support json_schema response_format", "structured output not
  // supported", "grammar ...", etc. Deliberately narrow so unrelated 400s
  // (context length, bad request) still surface as real errors.
  return /response_format|json[_ ]?schema|structured\s*output|grammar|json[_ ]?object/i.test(
    detail,
  );
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

/**
 * Fetch an image (any URL) and convert it to a base64 `data:` URL the
 * way LM Studio expects. The service worker has the relevant
 * host_permissions so cross-origin fetches succeed; for `data:` URLs
 * the conversion is a no-op pass-through.
 *
 * Throws a descriptive error rather than letting the upstream LM Studio
 * 400 (`'url' field must be a base64 encoded image`) surface — that
 * error confused users into thinking their vision model was broken.
 */
async function fetchAsDataUrl(
  fetchImpl: typeof fetch,
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  if (url.startsWith("data:")) return url;
  let res: Response;
  try {
    res = await fetchImpl(url, signal ? { signal } : {});
  } catch (cause: unknown) {
    throw new Error(
      `LMSTUDIO_IMAGE_FETCH_FAILED: could not download ${url} to encode ` +
        `for LM Studio (which only accepts base64 image input, not URLs). ` +
        `(${getErrorMessage(cause)})`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `LMSTUDIO_IMAGE_FETCH_FAILED: ${url} returned ${res.status}. ` +
        `If the URL requires auth (e.g. a private repo), the model can't ` +
        `reach it either — try downloading the image and pasting a public URL.`,
    );
  }
  const contentType =
    res.headers.get("content-type") ?? "application/octet-stream";
  // Heads-up on SVG: most vision models can't process raw SVG bytes.
  // We still try (LLaVA-Next / Qwen2-VL handle some), but warn loudly.
  if (/svg\+xml/i.test(contentType)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[NeuroDock] Image at ${url} is SVG (${contentType}). Most vision ` +
        `models can't read SVG directly — expect a poor description. ` +
        `Right-click a PNG/JPEG version of the image instead.`,
    );
  }
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);
  return `data:${contentType};base64,${base64}`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000; // avoid call-stack overflow on large images
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  // btoa is available in service-worker globals; the encoded output is
  // safe to inline in a data: URL.
  return btoa(binary);
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "unknown error";
}
