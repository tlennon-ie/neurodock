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
 * Docs: https://lmstudio.ai/docs/api/openai-api
 */
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";

export interface LMStudioOptions {
  readonly baseUrl: string;
  readonly apiKey?: string | null;
  readonly fetchImpl?: typeof fetch;
  readonly disableStreaming?: boolean;
}

export const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";

export function createLMStudioProvider(options: LMStudioOptions): Provider {
  const baseUrl = (options.baseUrl || LMSTUDIO_DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
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

  async function postOnce(
    request: ProviderRequest,
    stream: boolean,
  ): Promise<Response> {
    const url = `${baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: request.model,
      messages: [{ role: "user", content: request.prompt }],
      stream,
      response_format: { type: "json_object" },
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
}): Promise<string[]> {
  const baseUrl = (options.baseUrl || LMSTUDIO_DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
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
