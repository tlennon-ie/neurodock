---
name: check-rumination
description: Detect whether the user's current prompt is a semantic repeat of recent prompts within a rolling window. Returns an advisory signal; never blocks.
---

# check-rumination

Wrapper for `check_rumination` on the local mcp-guardrail server. Compares
the current prompt against a caller-supplied history window and reports
whether the count of similar prompts has crossed the threshold.

Authoritative schema: `packages/mcp-guardrail/schemas/check_rumination.schema.json`.
Design rationale: `docs/decisions/0006-guardrail-tool-design.md`. The
heuristic in v0.1.0 is word-overlap Jaccard, default threshold 0.55,
default window 90 minutes, default count 3.

This tool **never blocks** the user's action. It returns an advisory
signal the calling skill decides whether to surface, defer, or ignore.

## When to use

- Inside a guardrail-aware skill (e.g. `ocd-decision-finalizer`) at the
  top of the turn, before doing further analysis.
- When the same OCD-pattern prompt has been seen multiple times in a row
  and the skill wants confirmation before responding with more analysis.

## What it does

Calls `mcp__neurodock-guardrail__check_rumination`. The server is
**stateless** — the caller supplies the history; the server stores
nothing. The server:

1. Filters history to entries within `window_minutes` of now.
2. Scores Jaccard word-overlap between `current_prompt` and each
   surviving history entry.
3. Counts entries scoring above `similarity_threshold`.
4. Returns `detected: true` if count ≥ `threshold_count`.

## How to invoke

Input shape:

```json
{
  "current_prompt": "should I send the email or not",
  "history": [
    {
      "text": "should I send that email now",
      "at": "2026-05-23T08:42:00+01:00"
    },
    {
      "text": "is sending the email a bad idea",
      "at": "2026-05-23T08:51:00+01:00"
    },
    {
      "text": "the email - should I send it",
      "at": "2026-05-23T09:05:00+01:00"
    }
  ],
  "window_minutes": 90,
  "threshold_count": 3,
  "similarity_threshold": 0.55
}
```

Field rules:

- `current_prompt` (required): 1–8000 chars, verbatim.
- `history` (required): up to 500 entries, each `{text, at}`. The caller
  filters and redacts before sending.
- `window_minutes` (optional, default 90): 1–1440. Source from
  `profile.guardrails.rumination_window_minutes` when set.
- `threshold_count` (optional, default 3): 2–50. Floor of 2 because a
  single repeat is normal human behaviour.
- `similarity_threshold` (optional, default 0.55): 0.0–1.0. Lower yields
  more sensitivity and more false positives.

## Output shape (excerpt)

```json
{
  "detected": true,
  "count": 3,
  "window_seconds": 5400,
  "threshold": 3,
  "confidence": 0.78,
  "reason": "3 similar prompts within 90 minutes",
  "heuristic": "jaccard_v0_1_0",
  "override_options": [
    "genuinely_new",
    "i_know_im_ruminating_continue",
    "remind_me_later"
  ],
  "false_positive_feedback_path": "~/.neurodock/guardrail/false-positives.jsonl",
  "similar_prompts": [
    {
      "text": "should I send that email now",
      "at": "2026-05-23T08:42:00+01:00",
      "similarity": 0.82
    }
  ]
}
```

`detected: false` is a first-class return. The caller MUST respond
normally and SHOULD NOT surface any guardrail UI when detected is false.

## Override vocabulary

The `override_options` array is the v0.1.0 controlled vocabulary the user
can invoke when they disagree with the detection:

- `genuinely_new` — the user asserts the prompt is not a repeat. Lowers
  similarity weighting for the matched cluster in future evaluations.
- `i_know_im_ruminating_continue` — the user is aware and chooses to
  continue. The skill MUST proceed without further nudging in this turn.
- `remind_me_later` — defer the advisory; do not surface again until the
  next session boundary.

## Limitations

- Jaccard is a deliberately simple heuristic. v0.1.0 will produce false
  positives on prompts that share boilerplate words ("can you help me
  with..."). Embedding-based similarity lands in v0.0.2; the
  `similarity_threshold` field will remain to support deterministic
  fallback.
- The tool is advisory. It is the caller's responsibility to surface
  the signal without lecturing — see `ocd-decision-finalizer` for the
  reference handling.
- Clinical-review-required: schema and heuristic changes need sign-off
  per the `x-clinical-review-required` annotation in the schema and
  ETHICS.md commitment 3.

## Voice

When surfacing a detection, quote the prior similar prompt verbatim and
state the count plainly ("4 times in the last 90 minutes — same shape").
Always offer the override options as the next interaction; the user has
the final call. Do not pathologise — "ruminating" is the technical term
in code, not in the user-facing message.
