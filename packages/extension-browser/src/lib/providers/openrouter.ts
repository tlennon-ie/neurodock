/**
 * OpenRouter provider.
 *
 * Targets `https://openrouter.ai/api/v1/chat/completions`, which speaks
 * the OpenAI Chat Completions API. We hit it directly with `fetch` so
 * we can send OpenRouter's two recommended attribution headers without
 * forking the `openai` SDK:
 *
 *   - `HTTP-Referer: https://neurodock.org`
 *   - `X-Title: NeuroDock`
 *
 * The default model is `openrouter/auto` — OpenRouter's auto-router
 * which selects an appropriate model per request. Users can override
 * with any OpenRouter model slug (e.g. `anthropic/claude-3-5-sonnet`,
 * `meta-llama/llama-3.3-70b-instruct`).
 *
 * Docs:
 *   https://openrouter.ai/docs/api-reference/overview
 *   https://openrouter.ai/docs/guides/routing/routers/auto-router
 *
 * Streaming uses SSE (`stream: true`); each line is a `data: {...}` JSON
 * object whose delta lands at `choices[0].delta.content`. Final marker
 * is `data: [DONE]`. We fall back to a non-streaming POST if the
 * response is not an event stream.
 *
 * Error envelope normalisation: OpenRouter returns
 *   `{ error: { message, code, metadata? } }`
 * — slightly different from OpenAI's
 *   `{ error: { type, message } }`.
 * We translate auth/rate-limit/generic into the same prefix style as
 * the other providers (e.g. `OPENROUTER_AUTH_FAILED`).
 */
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";
import { logPromptIfEnabled } from "./debug-log.js";

export interface OpenRouterOptions {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly disableStreaming?: boolean;
  readonly referer?: string;
  readonly title?: string;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_REFERER = "https://neurodock.org";
const DEFAULT_TITLE = "NeuroDock";

export function createOpenRouterProvider(options: OpenRouterOptions): Provider {
  if (options.apiKey.length === 0) {
    throw new Error(
      "OPENROUTER_API_KEY_MISSING: Set an OpenRouter API key in Settings.",
    );
  }
  const f = options.fetchImpl ?? fetch.bind(globalThis);
  const referer = options.referer ?? DEFAULT_REFERER;
  const title = options.title ?? DEFAULT_TITLE;

  function buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
      // OpenRouter attribution headers per
      // https://openrouter.ai/docs/api-reference/overview
      "HTTP-Referer": referer,
      "X-Title": title,
    };
  }

  async function postOnce(
    request: ProviderRequest,
    stream: boolean,
    useJsonResponseFormat: boolean,
  ): Promise<Response> {
    // OpenRouter speaks OpenAI Chat Completions, including multimodal
    // content arrays. We don't gate on a model allowlist because
    // OpenRouter has hundreds of models — instead we trust the upstream
    // to 400 with a clear error if the routed model can't handle images.
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
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: "user", content }],
      stream,
    };
    if (useJsonResponseFormat) {
      payload.response_format = { type: "json_object" };
    }
    const body = JSON.stringify(payload);
    let res: Response;
    try {
      res = await f(DEFAULT_BASE_URL, {
        method: "POST",
        headers: buildHeaders(),
        body,
        signal: request.signal,
      });
    } catch (cause: unknown) {
      throw new Error(
        `OPENROUTER_UNREACHABLE: openrouter.ai did not respond. (${getErrorMessage(
          cause,
        )})`,
      );
    }
    if (!res.ok) {
      const detail = await readErrorBody(res);
      // P1.7 from the audit: OpenRouter forwards `response_format` to the
      // selected upstream model and some models (e.g. older Mistral
      // variants, some Llama hosts) reject the field with a 400. Detect
      // that specific shape and let the caller retry without it. We use
      // a sentinel exception so callers can distinguish "retry without
      // json mode" from a generic 400.
      if (
        res.status === 400 &&
        useJsonResponseFormat &&
        isResponseFormatRejection(detail)
      ) {
        throw new ResponseFormatRejected(detail);
      }
      throw normaliseOpenRouterError(res.status, detail);
    }
    return res;
  }

  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    await logPromptIfEnabled({
      provider: "openrouter",
      model: request.model,
      tool: request.tool,
      prompt: request.prompt,
    });
    if (options.disableStreaming === true) {
      return completeNonStreaming(request);
    }
    try {
      const res = await postOnce(request, true, true);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.toLowerCase().includes("text/event-stream")) {
        // Some upstream models surface non-streaming responses even when
        // we asked for `stream: true`. Aggregate the body as a single
        // chat-completion JSON instead of throwing.
        const text = await consumeNonStreamBody(res, request.onToken);
        return resultFor(request, text);
      }
      const text = await consumeSse(res, request.onToken);
      return resultFor(request, text);
    } catch (cause: unknown) {
      if (cause instanceof ResponseFormatRejected) {
        // Retry once on the streaming path without the json-mode hint.
        const res = await postOnce(request, true, false);
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().includes("text/event-stream")) {
          const text = await consumeNonStreamBody(res, request.onToken);
          return resultFor(request, text);
        }
        const text = await consumeSse(res, request.onToken);
        return resultFor(request, text);
      }
      if (cause instanceof Error && /OPENROUTER_/.test(cause.message)) {
        throw cause;
      }
      if (isStreamUnsupported(cause)) {
        return completeNonStreaming(request);
      }
      throw normaliseOpenRouterError(0, getErrorMessage(cause));
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

  return { id: "openrouter", complete };
}

function resultFor(request: ProviderRequest, text: string): ProviderResult {
  return {
    text,
    provenance: {
      mode: "cloud",
      provider: "openrouter",
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
  // eslint-disable-next-line no-constant-condition
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
    // Not JSON — could be an SSE blob misreported by content-type, try
    // parsing as SSE as a last resort so we never silently lose content.
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
        error?: { message?: unknown; code?: unknown };
      };
      const msg = obj.error?.message;
      if (typeof msg === "string" && msg.length > 0) return msg;
    } catch {
      // fall through, return raw
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
 * Sentinel raised by `postOnce` when OpenRouter rejects our request with
 * a 400 that names `response_format` (or the equivalent json-mode wording
 * its upstream model returned). The caller retries the request without
 * the `response_format` field. Same class of bug as the v0.0.6 LM Studio
 * fix (`LMSTUDIO_HTTP_400`).
 */
class ResponseFormatRejected extends Error {
  constructor(detail: string) {
    super(`OPENROUTER_RESPONSE_FORMAT_REJECTED: ${detail}`);
    this.name = "ResponseFormatRejected";
  }
}

function isResponseFormatRejection(detail: string): boolean {
  // Matches messages like "response_format.type must be 'text' or
  // 'json_schema'", "Invalid response_format", "response_format is not
  // supported by this model", etc.
  return /response_format|json[_ ]object|json[_ ]mode/i.test(detail);
}

function normaliseOpenRouterError(status: number, detail: string): Error {
  if (status === 401 || /invalid.*api.*key|unauthor/i.test(detail)) {
    return new Error(
      "OPENROUTER_AUTH_FAILED: OpenRouter key was rejected. Check Settings.",
    );
  }
  if (status === 429 || /rate.?limit/i.test(detail)) {
    return new Error(
      "OPENROUTER_RATE_LIMITED: Too many requests. Wait and retry.",
    );
  }
  if (status === 402 || /insufficient.*credit|payment/i.test(detail)) {
    return new Error(
      "OPENROUTER_INSUFFICIENT_CREDITS: Top up your OpenRouter balance.",
    );
  }
  const prefix = status > 0 ? `OPENROUTER_HTTP_${status}` : "OPENROUTER_ERROR";
  const body = detail.length > 0 ? `: ${detail}` : "";
  return new Error(`${prefix}${body}`);
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "unknown error";
}
