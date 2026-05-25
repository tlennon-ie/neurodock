/**
 * Google Gemini provider.
 *
 * Targets Google's OpenAI-compatible endpoint at
 * `https://generativelanguage.googleapis.com/v1beta/openai`. The wire
 * format is the standard OpenAI Chat Completions shape — same SSE
 * framing, same multimodal `content` array, just a different base URL
 * and an `Authorization: Bearer <api_key>` header carrying a Google AI
 * Studio key.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/openai
 *
 * Default model is `gemini-2.0-flash` — fast, cheap, vision-capable.
 * Users can override with any Gemini chat-completion model — every
 * Gemini family member from 1.5 onwards is multimodal, so
 * `gemini-pro-latest`, `gemini-flash-latest`, `gemini-3.5-flash`,
 * `gemini-3-pro-preview`, `gemini-2.5-pro`, `gemini-1.5-pro`, etc.
 * all work for both text and image input.
 *
 * Vision: Google's endpoint accepts both http(s) image URLs AND base64
 * data URLs verbatim, so — unlike LM Studio — we do NOT need to pre-fetch
 * and base64-encode the image. URLs are passed through as-is in the
 * `image_url.url` field of the multimodal content array.
 *
 * Streaming uses SSE (`stream: true`); each line is a `data: {...}` JSON
 * object whose delta lands at `choices[0].delta.content`. Final marker
 * is `data: [DONE]`. We fall back to a single non-streaming JSON body
 * if the response is not an event stream.
 *
 * Error envelope normalisation: Google's OpenAI-compat endpoint returns
 * either `{ error: { message, code, status } }` (Google-native shape) or
 * the OpenAI `{ error: { type, message } }` shape depending on which
 * upstream raised the error. We extract `error.message` either way and
 * map status codes to `GOOGLE_*` prefixes for the UI.
 *
 * Known quirks (not implemented here — surface as-is to the user):
 *   - Some Gemini models reject `response_format: json_object` with a
 *     400. We mirror OpenRouter's retry-without-json-mode dance to
 *     absorb that without leaking the raw error.
 */
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";

export const GOOGLE_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
export const GOOGLE_DEFAULT_MODEL = "gemini-2.0-flash";

export interface GoogleOptions {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly disableStreaming?: boolean;
}

export function createGoogleProvider(options: GoogleOptions): Provider {
  if (options.apiKey.length === 0) {
    throw new Error(
      "GOOGLE_API_KEY_MISSING: Set a Google AI Studio API key in Settings.",
    );
  }
  const f = options.fetchImpl ?? fetch.bind(globalThis);

  function buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    };
  }

  async function postOnce(
    request: ProviderRequest,
    stream: boolean,
    useJsonResponseFormat: boolean,
  ): Promise<Response> {
    const content = buildGoogleContent(request);
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: "user", content }],
      stream,
    };
    if (useJsonResponseFormat) {
      payload.response_format = { type: "json_object" };
    }
    const body = JSON.stringify(payload);
    const url = `${GOOGLE_BASE_URL}/chat/completions`;
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
        `GOOGLE_UNREACHABLE: generativelanguage.googleapis.com did not ` +
          `respond. (${getErrorMessage(cause)})`,
      );
    }
    if (!res.ok) {
      const detail = await readErrorBody(res);
      if (
        res.status === 400 &&
        useJsonResponseFormat &&
        isResponseFormatRejection(detail)
      ) {
        throw new ResponseFormatRejected(detail);
      }
      throw normaliseGoogleError(res.status, detail);
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
        const res = await postOnce(request, true, false);
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().includes("text/event-stream")) {
          const text = await consumeNonStreamBody(res, request.onToken);
          return resultFor(request, text);
        }
        const text = await consumeSse(res, request.onToken);
        return resultFor(request, text);
      }
      if (cause instanceof Error && /GOOGLE_/.test(cause.message)) {
        throw cause;
      }
      if (
        cause instanceof Error &&
        /VISION_MODEL_REQUIRED/.test(cause.message)
      ) {
        throw cause;
      }
      if (isStreamUnsupported(cause)) {
        return completeNonStreaming(request);
      }
      throw normaliseGoogleError(0, getErrorMessage(cause));
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

  return { id: "google", complete };
}

function resultFor(request: ProviderRequest, text: string): ProviderResult {
  return {
    text,
    provenance: {
      mode: "cloud",
      provider: "google",
      model: request.model,
    },
  };
}

/**
 * Build the `messages[0].content` payload. For text-only requests we send
 * a plain string. For multimodal `describe_image` requests we send the
 * OpenAI-format part array. URLs (including base64 `data:` URLs) are
 * passed through verbatim — Google's endpoint accepts both shapes, so
 * we never pre-fetch and re-encode the way LM Studio requires.
 */
type GoogleMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

function buildGoogleContent(request: ProviderRequest): GoogleMessageContent {
  const images = request.images ?? [];
  if (images.length === 0) return request.prompt;
  if (!isVisionCapableGoogleModel(request.model)) {
    throw new Error(
      `VISION_MODEL_REQUIRED: model "${request.model}" doesn't appear to ` +
        `support image input. Try gemini-pro-latest, gemini-flash-latest, ` +
        `gemini-2.5-flash, or gemini-2.0-flash in Settings.`,
    );
  }
  return [
    { type: "text", text: request.prompt },
    ...images.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];
}

/**
 * Pre-flight check: is this model expected to accept image input?
 *
 * Every Gemini chat-completion model from 1.5 onwards is multimodal —
 * vision is the default, not an opt-in. The previous version of this
 * function hardcoded the known minor-version slugs (`gemini-1.5`,
 * `gemini-2.0`, `gemini-2.5`) and rejected anything outside that
 * window, so current aliases the user types from the Google docs
 * (`gemini-pro-latest`, `gemini-flash-latest`, `gemini-3-pro-preview`,
 * `gemini-3.5-flash`, …) failed our pre-flight check even though the
 * Google endpoint itself accepts them. That guard is now inverted:
 * accept any `gemini-*` slug, and only reject the known non-chat
 * Google model families (embeddings + AQA). New Gemini chat models
 * will work without a code change; only embedding/AQA slugs route
 * to a friendly client-side error before we hit the wire.
 *
 * Failure mode if a future non-vision Gemini family ever ships: a
 * Google 400 will surface via `normaliseGoogleError` with the
 * server-supplied detail.
 */
const NON_CHAT_GOOGLE_SLUG = /(embedding|^aqa$|^aqa[-_])/i;

export function isVisionCapableGoogleModel(model: string): boolean {
  const m = model.toLowerCase().trim();
  if (m.length === 0) return false;
  if (NON_CHAT_GOOGLE_SLUG.test(m)) return false;
  return /^gemini[-/]/.test(m) || m === "gemini";
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
        error?: { message?: unknown; code?: unknown; status?: unknown };
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
 * Sentinel raised by `postOnce` when Google rejects our request with a
 * 400 that names `response_format`. The caller retries the request
 * without the field. Same pattern as the OpenRouter and LM Studio
 * providers — some upstream Gemini models reject json-mode hints.
 */
class ResponseFormatRejected extends Error {
  constructor(detail: string) {
    super(`GOOGLE_RESPONSE_FORMAT_REJECTED: ${detail}`);
    this.name = "ResponseFormatRejected";
  }
}

function isResponseFormatRejection(detail: string): boolean {
  return /response_format|json[_ ]object|json[_ ]mode/i.test(detail);
}

function normaliseGoogleError(status: number, detail: string): Error {
  if (status === 401 || /invalid.*api.*key|unauthor/i.test(detail)) {
    return new Error(
      "GOOGLE_AUTH_FAILED: Google API key was rejected. Check Settings.",
    );
  }
  if (status === 404 || /model.*not.*found|not.*found.*model/i.test(detail)) {
    return new Error(
      `GOOGLE_MODEL_NOT_FOUND: ${
        detail || "The requested Gemini model is not available."
      }`,
    );
  }
  if (status === 429 || /rate.?limit|quota/i.test(detail)) {
    return new Error("GOOGLE_RATE_LIMITED: Too many requests. Wait and retry.");
  }
  const prefix = status > 0 ? `GOOGLE_HTTP_${status}` : "GOOGLE_ERROR";
  const body = detail.length > 0 ? `: ${detail}` : "";
  return new Error(`${prefix}${body}`);
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "unknown error";
}

/**
 * Fetch the list of available Gemini models from Google's OpenAI-compat
 * endpoint. The response shape matches OpenAI's `/v1/models`:
 *   `{ data: [{ id: "models/gemini-2.0-flash", ... }, ...] }`
 *
 * Note: Google's endpoint returns IDs with a `models/` prefix. Strip it
 * so the dropdown shows clean slugs (`gemini-2.0-flash`) matching what
 * users type into the docs.
 */
export async function fetchGoogleModels(args: {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<string[]> {
  if (args.apiKey.length === 0) {
    throw new Error(
      "GOOGLE_API_KEY_MISSING: Set a Google AI Studio API key in Settings.",
    );
  }
  const f = args.fetchImpl ?? fetch.bind(globalThis);
  let res: Response;
  try {
    res = await f(`${GOOGLE_BASE_URL}/models`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      signal: args.signal,
    });
  } catch (cause: unknown) {
    throw new Error(
      `GOOGLE_UNREACHABLE: generativelanguage.googleapis.com did not ` +
        `respond. (${getErrorMessage(cause)})`,
    );
  }
  if (res.status === 401) {
    throw new Error(
      "GOOGLE_AUTH_FAILED: Google API key was rejected. Check Settings.",
    );
  }
  if (!res.ok) {
    throw new Error(`GOOGLE_HTTP_${res.status}: ${res.statusText}`);
  }
  const raw = await res.text();
  try {
    const obj = JSON.parse(raw) as { data?: Array<{ id?: unknown }> };
    if (!obj.data) return [];
    const ids = obj.data
      .map((m) => (typeof m.id === "string" ? m.id : null))
      .filter((id): id is string => id !== null && id.length > 0)
      .map((id) =>
        id.startsWith("models/") ? id.slice("models/".length) : id,
      );
    // Surface chat-completion-eligible Gemini models first; embedding
    // models and other non-chat slugs (e.g. `text-embedding-004`,
    // `aqa`) would 400 against `/chat/completions`.
    const chatLike = ids.filter((id) => /^gemini/i.test(id));
    return chatLike.length > 0 ? chatLike : ids;
  } catch {
    return [];
  }
}
