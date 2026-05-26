/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Ollama provider.
 *
 * Talks to a local Ollama server (default http://localhost:11434).
 * Ollama's `/api/generate` endpoint streams newline-delimited JSON
 * objects: each chunk has `{ response: string, done: boolean, ... }`.
 * We aggregate `response` deltas into the final text and surface each
 * delta via `onToken`.
 *
 * Throws `OLLAMA_UNREACHABLE` when the endpoint is down so the
 * translation-client can fall through to a labelled mock.
 *
 * v0.0.4 adds `OLLAMA_PERMISSION_REQUIRED` for non-localhost endpoints
 * that have not been granted host permission. The check is delegated
 * via the optional `hasPermission` callback so the provider remains
 * decoupled from chrome.permissions and unit-testable.
 */
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";
import { logPromptIfEnabled } from "./debug-log.js";

export interface OllamaOptions {
  readonly endpoint: string;
  readonly fetchImpl?: typeof fetch;
  /**
   * Optional permission probe. Called before any fetch. When provided
   * and the probe returns `false`, the provider throws
   * `OLLAMA_PERMISSION_REQUIRED` instead of attempting a fetch that
   * would be blocked by the host_permissions gate.
   */
  readonly hasPermission?: (baseUrl: string) => Promise<boolean>;
}

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

export function createOllamaProvider(options: OllamaOptions): Provider {
  const endpoint = options.endpoint.replace(/\/+$/, "");
  const f = options.fetchImpl ?? fetch.bind(globalThis);

  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    if (request.images && request.images.length > 0) {
      // Vision support for local Ollama requires a vision-capable model
      // (llava, llama3.2-vision, bakllava, moondream, minicpm-v) and a
      // base64-image payload — different shape from text-only. Phase 2.
      throw new Error(
        `VISION_MODEL_REQUIRED: image translation isn't yet supported on ` +
          `the local Ollama lane. Switch to cloud mode with a vision-capable ` +
          `model (gpt-4o-mini, claude-haiku-4-5) in the popup Settings tab.`,
      );
    }
    if (options.hasPermission) {
      const allowed = await options.hasPermission(endpoint);
      if (!allowed) {
        throw new Error(
          `OLLAMA_PERMISSION_REQUIRED: Grant permission for ${originOf(
            endpoint,
          )} first. Click 'Test connection' to trigger the prompt.`,
        );
      }
    }
    await logPromptIfEnabled({
      provider: "ollama",
      model: request.model,
      tool: request.tool,
      prompt: request.prompt,
    });
    const url = `${endpoint}/api/generate`;
    const body = JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      stream: true,
      format: "json",
    });
    let response: Response;
    try {
      response = await f(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: request.signal,
      });
    } catch (cause: unknown) {
      throw new Error(
        `OLLAMA_UNREACHABLE: ${endpoint} did not respond. ` +
          `Is Ollama running? (${getErrorMessage(cause)})`,
      );
    }
    if (!response.ok) {
      throw new Error(`OLLAMA_HTTP_${response.status}: ${response.statusText}`);
    }
    const text = await consumeNdjson(response, request.onToken);
    return {
      text,
      provenance: { mode: "local", provider: "ollama", model: request.model },
    };
  }
  return { id: "ollama", complete };
}

async function consumeNdjson(
  response: Response,
  onToken?: (delta: string) => void,
): Promise<string> {
  if (!response.body) {
    const raw = await response.text();
    return aggregateLines(raw, onToken);
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
      const delta = parseLine(line);
      if (delta.length > 0) {
        out += delta;
        onToken?.(delta);
      }
    }
  }
  if (buffer.length > 0) {
    const delta = parseLine(buffer);
    if (delta.length > 0) {
      out += delta;
      onToken?.(delta);
    }
  }
  return out;
}

function aggregateLines(
  raw: string,
  onToken?: (delta: string) => void,
): string {
  let out = "";
  for (const line of raw.split("\n")) {
    const delta = parseLine(line);
    if (delta.length > 0) {
      out += delta;
      onToken?.(delta);
    }
  }
  return out;
}

function parseLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "";
  try {
    const obj = JSON.parse(trimmed) as { response?: unknown };
    if (typeof obj.response === "string") return obj.response;
    return "";
  } catch {
    return "";
  }
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "unknown error";
}
