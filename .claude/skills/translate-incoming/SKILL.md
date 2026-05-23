---
name: translate-incoming
description: Decode subtext and ambiguity in an incoming corporate message via mcp-translation. Returns explicit ask, ranked subtext, ambiguity spans anchored verbatim, and a recommended next action.
---

# translate-incoming

Wrapper for `translate_incoming` on the local mcp-translation server.
Takes a verbatim incoming message and returns a structured decode useful
for autistic / audhd readers who want the implicit corporate-speak made
explicit.

Authoritative schema: `packages/mcp-translation/schemas/translate_incoming.schema.json`.
Design rationale: `docs/decisions/0005-translation-tool-design.md` —
ambiguity spans MUST anchor verbatim to the input.

## When to use

- The user pastes a Slack / email / Linear / GitHub message and says
  "what does this actually mean" or "decode this".
- The browser extension's right-click action.
- Before drafting a reply, when the user is unsure what is actually being
  asked.

## What it does

Calls `mcp__neurodock-translation__translate_incoming`. The server
itself performs no LLM calls — it orchestrates a prompt template against
the caller's MCP-client LLM (local Ollama or cloud, per the user's
profile) and returns the typed response.

The response contains:

- `explicit_ask` — the surface-level request, paraphrased plainly. Null
  if the message is a status update with no ask.
- `likely_subtext[]` — up to 5 ranked hypotheses about implicit meaning,
  each with a 0..1 `confidence` score.
- `ambiguity` — a report of spans whose meaning is unclear, with
  `{start_char, end_char, reason, note}`. **The quoted span MUST equal
  `text[start_char:end_char]` exactly.** This is the verbatim-anchor
  invariant from ADR 0005.
- `recommended_next_action` — a single coarse action + a short
  justification.
- `model_provenance` — which model ran the call (local vs cloud, model id).

## How to invoke

Input shape:

```json
{
  "text": "Hey — can we revisit the rollout timeline? I'm not sure everyone is aligned.",
  "channel": "slack",
  "thread_context": [
    "We agreed last sprint to ship the rollout by end of May.",
    "Two engineers flagged risk on the migration script."
  ]
}
```

Field rules:

- `text` (required): 1–8000 chars. Stored only in-memory; never logged.
- `channel` (optional): one of the v0.1.0 enum
  (`slack`, `email`, `teams`, `linear`, `github`, `generic`). Influences
  register expectations. Use `generic` if unsure.
- `thread_context` (optional): up to 20 prior messages, oldest first.
  Each entry is a verbatim quote, 1–2000 chars.
- `target_language` (optional): BCP-47 tag (e.g. `en-IE`, `de`, `ja`).
  Falls back to English prompts if no language pack is registered.

## The verbatim-anchor invariant

Every ambiguity span the caller receives satisfies:

```
input.text[span.start_char : span.end_char]  ==  (the substring shown in note context)
```

The server's `VERBATIM_ANCHOR_FAILED` error guarantees this — the LLM
cannot fabricate a span. If the response is invalid, the server rejects
and the caller retries; it does not "fix up" mismatches.

When rendering ambiguity to a user, **always quote the verbatim substring,
not a paraphrase**. The whole point of the schema's anchor is that the
user can trust the quote.

## Errors

- `TEXT_REQUIRED` — empty text.
- `TEXT_TOO_LONG` — over 8000 chars. Split or excerpt.
- `CHANNEL_UNKNOWN` — channel not in the v0.1.0 enum. Use `generic`.
- `LANGUAGE_PACK_MISSING` — target_language has no pack. Retry without
  it to fall back to English.
- `MODEL_UNAVAILABLE` — caller's MCP client could not reach its LLM.
  Server does not retry; caller decides to surface or queue.
- `VERBATIM_ANCHOR_FAILED` — LLM fabricated a span. Retry the call.

## Limitations

- The translation quality depends on the caller's configured model.
  Local 7B Ollama is more likely to hallucinate than a frontier cloud
  model, and the verbatim-anchor enforcement will reject those responses.
  Acceptable failure mode — see ADR 0005 trade-offs section.
- The server does not store transcripts. If the user wants to come back
  to a decode later, the caller must persist it.
- Eval coverage lives at
  `packages/evals/corpora/translation/incoming/v0.1.0/general.jsonl` —
  prompt changes ship through the eval pipeline.

## Voice

When surfacing subtext to the user, lead with the top-confidence
hypothesis and label it as a hypothesis ("most likely they mean X"), not
as a fact. Quote ambiguous spans verbatim. Do not perform the recommended
next action without confirmation — the user reads the brief; the user
decides.
