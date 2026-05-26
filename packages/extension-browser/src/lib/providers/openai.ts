/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
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
import { logPromptIfEnabled } from "./debug-log.js";

export interface OpenAIOptions {
  readonly apiKey: string;
  readonly clientFactory?: (apiKey: string) => OpenAI;
  readonly disableStreaming?: boolean;
}

export function createOpenAIProvider(options: OpenAIOptions): Provider {
  if (options.apiKey.length === 0) {
    throw new Error(
      "OPENAI_API_KEY_MISSING: Set an OpenAI API key in Settings.",
    );
  }
  const client =
    options.clientFactory?.(options.apiKey) ??
    new OpenAI({ apiKey: options.apiKey, dangerouslyAllowBrowser: true });

  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    await logPromptIfEnabled({
      provider: "openai",
      model: request.model,
      tool: request.tool,
      prompt: request.prompt,
    });
    if (options.disableStreaming === true) {
      return completeNonStreaming(client, request);
    }
    try {
      return await completeStreaming(client, request);
    } catch (cause: unknown) {
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
  request: ProviderRequest,
): Promise<ProviderResult> {
  const stream = await client.chat.completions.create(
    {
      model: request.model,
      stream: true,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildOpenAIContent(request) }],
    },
    { signal: request.signal },
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
  request: ProviderRequest,
): Promise<ProviderResult> {
  let completion;
  try {
    completion = await client.chat.completions.create(
      {
        model: request.model,
        stream: false,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildOpenAIContent(request) }],
      },
      { signal: request.signal },
    );
  } catch (cause: unknown) {
    throw normaliseOpenAIError(cause);
  }
  const text = completion.choices?.[0]?.message?.content ?? "";
  if (text.length > 0) request.onToken?.(text);
  return {
    text,
    provenance: { mode: "cloud", provider: "openai", model: request.model },
  };
}

/**
 * Build the `messages[0].content` payload for an OpenAI Chat Completions
 * call. When `request.images` is non-empty we send the multimodal
 * content array (text + image_url parts) — this is the canonical
 * vision-model input shape. OpenAI silently 400s on text-only models
 * sent multimodal content, so this path is gated on `images` presence.
 *
 * For describe_image we additionally check `model` against a coarse
 * vision-capability allowlist and surface a clearer error than the
 * generic 400. See `isVisionCapableOpenAIModel`.
 */
type OpenAIMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

function buildOpenAIContent(request: ProviderRequest): OpenAIMessageContent {
  const images = request.images ?? [];
  if (images.length === 0) return request.prompt;
  if (!isVisionCapableOpenAIModel(request.model)) {
    throw new Error(
      `VISION_MODEL_REQUIRED: model "${request.model}" doesn't appear to ` +
        `support image input. Try gpt-4o-mini, gpt-4o, gpt-4-turbo, or ` +
        `an o1/o3-series model in Settings.`,
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
 * Coarse allowlist for OpenAI models known to accept image input.
 * Pattern-matched to absorb future minor releases. New families need to
 * be added here; the failure mode is a clear VISION_MODEL_REQUIRED
 * error rather than an opaque OpenAI 400.
 */
export function isVisionCapableOpenAIModel(model: string): boolean {
  const m = model.toLowerCase();
  if (m.startsWith("gpt-4o")) return true;
  if (m.startsWith("gpt-4-turbo")) return true;
  if (m.startsWith("gpt-4-vision")) return true;
  if (m.startsWith("gpt-5")) return true;
  if (/^o[134](-|$)/.test(m)) return true;
  if (m.startsWith("chatgpt-4o")) return true;
  return false;
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
        "OPENAI_AUTH_FAILED: API key was rejected. Check Settings.",
      );
    }
    if (/429|rate.?limit/i.test(msg)) {
      return new Error(
        "OPENAI_RATE_LIMITED: Too many requests. Wait and retry.",
      );
    }
    return new Error(`OPENAI_ERROR: ${msg}`);
  }
  return new Error("OPENAI_ERROR: unknown failure");
}
