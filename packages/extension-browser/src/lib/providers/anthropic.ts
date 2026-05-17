/**
 * Anthropic provider.
 *
 * Uses the official @anthropic-ai/sdk against api.anthropic.com.
 * Streaming via messages.stream(); each `text` event yields a delta.
 *
 * `dangerouslyAllowBrowser: true` is set because this is an MV3 service
 * worker, the user holds their own key locally in
 * `chrome.storage.local`, and the persistent cloud-mode banner makes
 * the consent state visible.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";

export interface AnthropicOptions {
  readonly apiKey: string;
  readonly clientFactory?: (apiKey: string) => Anthropic;
  readonly disableStreaming?: boolean;
}

const MAX_TOKENS = 2048;

export function createAnthropicProvider(options: AnthropicOptions): Provider {
  if (options.apiKey.length === 0) {
    throw new Error(
      "ANTHROPIC_API_KEY_MISSING: Set an Anthropic API key in Settings."
    );
  }
  const client =
    options.clientFactory?.(options.apiKey) ??
    new Anthropic({ apiKey: options.apiKey, dangerouslyAllowBrowser: true });

  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    if (options.disableStreaming === true) {
      return completeNonStreaming(client, request);
    }
    try { return await completeStreaming(client, request); }
    catch (cause: unknown) {
      if (isStreamUnsupported(cause)) {
        return completeNonStreaming(client, request);
      }
      throw normaliseAnthropicError(cause);
    }
  }
  return { id: "anthropic", complete };
}

async function completeStreaming(
  client: Anthropic,
  request: ProviderRequest
): Promise<ProviderResult> {
  const stream = client.messages.stream(
    {
      model: request.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: request.prompt }],
    },
    { signal: request.signal }
  );
  stream.on("text", (delta: string) => {
    if (delta.length > 0) request.onToken?.(delta);
  });
  const finalMessage = await stream.finalMessage();
  const text = extractText(finalMessage);
  return {
    text,
    provenance: { mode: "cloud", provider: "anthropic", model: request.model },
  };
}

async function completeNonStreaming(
  client: Anthropic,
  request: ProviderRequest
): Promise<ProviderResult> {
  let response;
  try {
    response = await client.messages.create(
      {
        model: request.model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: request.prompt }],
      },
      { signal: request.signal }
    );
  } catch (cause: unknown) { throw normaliseAnthropicError(cause); }
  const text = extractText(response);
  if (text.length > 0) request.onToken?.(text);
  return {
    text,
    provenance: { mode: "cloud", provider: "anthropic", model: request.model },
  };
}

interface AnthropicTextBlock { readonly type: string; readonly text?: string; }
interface AnthropicMessageLike { readonly content?: readonly AnthropicTextBlock[]; }

function extractText(message: AnthropicMessageLike): string {
  if (!message.content) return "";
  return message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text ?? "")
    .join("");
}

function isStreamUnsupported(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return /event-stream|stream not supported/i.test(cause.message);
}

function normaliseAnthropicError(cause: unknown): Error {
  if (cause instanceof Error) {
    const msg = cause.message;
    if (/401|unauthorized|invalid.*api.*key/i.test(msg)) {
      return new Error(
        "ANTHROPIC_AUTH_FAILED: API key was rejected. Check Settings."
      );
    }
    if (/429|rate.?limit/i.test(msg)) {
      return new Error(
        "ANTHROPIC_RATE_LIMITED: Too many requests. Wait and retry."
      );
    }
    return new Error(`ANTHROPIC_ERROR: ${msg}`);
  }
  return new Error("ANTHROPIC_ERROR: unknown failure");
}
