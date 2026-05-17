/**
 * OpenAI provider.
 *
 * Uses the official `openai` SDK against api.openai.com via Chat
 * Completions. Streaming via `stream: true` returning an async iterable
 * of `ChatCompletionChunk`s; each delta arrives in
 * `choices[0].delta.content`.
 */
import OpenAI from "openai";
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";

export interface OpenAIOptions {
  readonly apiKey: string;
  readonly clientFactory?: (apiKey: string) => OpenAI;
  readonly disableStreaming?: boolean;
}

export function createOpenAIProvider(options: OpenAIOptions): Provider {
  if (options.apiKey.length === 0) {
    throw new Error(
      "OPENAI_API_KEY_MISSING: Set an OpenAI API key in Settings."
    );
  }
  const client =
    options.clientFactory?.(options.apiKey) ??
    new OpenAI({ apiKey: options.apiKey, dangerouslyAllowBrowser: true });

  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    if (options.disableStreaming === true) {
      return completeNonStreaming(client, request);
    }
    try { return await completeStreaming(client, request); }
    catch (cause: unknown) {
      if (isStreamUnsupported(cause)) {
        return completeNonStreaming(client, request);
      }
      throw normaliseOpenAIError(cause);
    }
  }
  return { id: "openai", complete };
}

async function completeStreaming(
  client: OpenAI,
  request: ProviderRequest
): Promise<ProviderResult> {
  const stream = await client.chat.completions.create(
    {
      model: request.model,
      stream: true,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: request.prompt }],
    },
    { signal: request.signal }
  );
  let text = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (typeof delta === "string" && delta.length > 0) {
      text += delta;
      request.onToken?.(delta);
    }
  }
  return {
    text,
    provenance: { mode: "cloud", provider: "openai", model: request.model },
  };
}

async function completeNonStreaming(
  client: OpenAI,
  request: ProviderRequest
): Promise<ProviderResult> {
  let completion;
  try {
    completion = await client.chat.completions.create(
      {
        model: request.model,
        stream: false,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: request.prompt }],
      },
      { signal: request.signal }
    );
  } catch (cause: unknown) { throw normaliseOpenAIError(cause); }
  const text = completion.choices?.[0]?.message?.content ?? "";
  if (text.length > 0) request.onToken?.(text);
  return {
    text,
    provenance: { mode: "cloud", provider: "openai", model: request.model },
  };
}

function isStreamUnsupported(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return /event-stream|stream not supported/i.test(cause.message);
}

function normaliseOpenAIError(cause: unknown): Error {
  if (cause instanceof Error) {
    const msg = cause.message;
    if (/401|unauthorized|invalid.*api.*key/i.test(msg)) {
      return new Error(
        "OPENAI_AUTH_FAILED: API key was rejected. Check Settings."
      );
    }
    if (/429|rate.?limit/i.test(msg)) {
      return new Error(
        "OPENAI_RATE_LIMITED: Too many requests. Wait and retry."
      );
    }
    return new Error(`OPENAI_ERROR: ${msg}`);
  }
  return new Error("OPENAI_ERROR: unknown failure");
}
