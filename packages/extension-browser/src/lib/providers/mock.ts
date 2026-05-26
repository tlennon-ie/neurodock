/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Mock provider.
 *
 * Returns a deterministic, schema-valid completion for every tool.
 * Used as an explicit "mode: mock" choice in Settings for developer
 * testing, and as a fall-back from local mode when Ollama is unreachable.
 */
import type { Provider, ProviderRequest, ProviderResult } from "./provider.js";
import type { TranslationTool } from "../types.js";

const SCHEMA_VERSION = "0.1.0";

export interface MockOptions {
  readonly reason: "force_mock" | "local_default" | "endpoint_unreachable";
}

export function createMockProvider(options: MockOptions): Provider {
  async function complete(request: ProviderRequest): Promise<ProviderResult> {
    const text = JSON.stringify(buildMockData(request.tool, options.reason));
    if (text.length > 0) request.onToken?.(text);
    return {
      text,
      provenance: {
        mode: "local",
        provider: "mock",
        model: `mock-stub (schema-v${SCHEMA_VERSION})`,
      },
    };
  }
  return { id: "mock", complete };
}

export function buildMockData(
  tool: TranslationTool,
  reason: string,
): Record<string, unknown> {
  const noteHeader =
    "[MOCK] This response is a deterministic placeholder. Configure local " +
    "Ollama or cloud mode in the popup to enable real translation. " +
    `(reason: ${reason})`;
  const evalSlice = `packages/evals/corpora/translation/${tool.replace(
    "_",
    "/",
  )}/v0.1.0/mock.jsonl`;
  const provenance = {
    mode: "local",
    provider: "mock",
    model: `mock-stub (schema-v${SCHEMA_VERSION})`,
  };
  if (tool === "translate_incoming") {
    return {
      explicit_ask: noteHeader,
      likely_subtext: [
        {
          text:
            "[MOCK] Subtext analysis stub. The real model would rank likely " +
            "implicit meanings here.",
          confidence: 0.5,
        },
      ],
      ambiguity: { detected: false, spans: [] },
      recommended_next_action: {
        action: "clarify",
        reason:
          "[MOCK] Recommendation placeholder. Configure a model to receive " +
          "a real next-action suggestion.",
        draft_reply: null,
      },
      eval_corpus_slice: evalSlice,
      model_provenance: provenance,
    };
  }
  if (tool === "check_tone") {
    return {
      axes: { directness: 50, warmth: 50, urgency: 50 },
      axes_target: null,
      baseline_delta: null,
      flagged_phrases: [],
      suggested_rewrite_hint: `${noteHeader}\n\nNo rewrite hint in mock mode.`,
      eval_corpus_slice: evalSlice,
      model_provenance: provenance,
    };
  }
  if (tool === "rewrite_outgoing") {
    return {
      rewritten: noteHeader,
      preserved_terms: [],
      unpreserved_terms: [],
      diff_summary: "[MOCK] No rewrite performed.",
      eval_corpus_slice: evalSlice,
      model_provenance: provenance,
    };
  }
  if (tool === "describe_image") {
    return {
      description:
        "[MOCK] Image-description stub. Configure a vision-capable cloud " +
        "model (gpt-4o-mini, claude-haiku-4-5) to receive a real description.",
      contains_text: false,
      transcribed_text: null,
      key_elements: [],
      inferred_purpose: "[MOCK] Purpose inference disabled in mock mode.",
      accessibility_notes: null,
      eval_corpus_slice: evalSlice,
      model_provenance: provenance,
    };
  }
  return {
    my_asks: [],
    others_asks: [],
    decisions: [],
    ambiguous_items: [],
    eval_corpus_slice: evalSlice,
    model_provenance: provenance,
  };
}
