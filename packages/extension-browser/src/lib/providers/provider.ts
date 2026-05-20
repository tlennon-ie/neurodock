/**
 * Provider interface.
 *
 * Each concrete provider (ollama / anthropic / openai / mock) implements
 * this contract. The translation-client dispatches to one of them per
 * request based on `profile.mode` + `profile.cloudProvider`.
 *
 * Design rules:
 * - Providers receive a fully-assembled prompt (the prompt template +
 *   user input, plus the JSON output schema appended). They return raw
 *   JSON text; validation against the schema is the caller's job in
 *   `validation.ts`.
 * - Streaming is opt-in via `onToken`. If a provider's transport does
 *   not support streaming, it MUST still call `onToken` once with the
 *   full text before resolving, so the caller's UI behaves uniformly.
 * - Errors throw. The caller maps them to a `TranslationResponse` with
 *   `ok:false` and a human-readable `error` string.
 * - No provider may log the prompt or completion text.
 */
import type { ModelProvenance, TranslationTool } from "../types.js";

export interface ProviderRequest {
  readonly tool: TranslationTool;
  readonly prompt: string;
  readonly model: string;
  readonly signal?: AbortSignal;
  readonly onToken?: (delta: string) => void;
}

export interface ProviderResult {
  readonly text: string;
  readonly provenance: ModelProvenance;
}

export interface Provider {
  readonly id: string;
  complete(request: ProviderRequest): Promise<ProviderResult>;
}
