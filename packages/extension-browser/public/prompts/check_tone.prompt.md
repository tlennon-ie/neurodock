You are scoring an outgoing message on three tone axes for a neurodivergent
writer who wants to understand how the message will land before sending it.

Channel: {channel}
Target register: {target_register}
Baseline messages (sender's prior register; may be empty):
{baseline_messages}

Message:
"""
{text}
"""

A deterministic pre-analysis is included below. Treat it as a baseline you may
refine; you MAY adjust the axis scores by up to ±15 in either direction if the
prose evidence supports it.

Deterministic pre-analysis:
{deterministic_summary}

Return a JSON object conforming to the v0.1.0 schema at
`packages/mcp-translation/schemas/check_tone.schema.json` (the `output`
sub-schema). Required keys:

- `axes`: `{{directness, warmth, urgency}}` each 0..100. 50 is neutral.
- `axes_target`: same shape, populated only when target_register was given.
- `baseline_delta`: signed percentage-point deltas vs the baseline sample.
  Null when fewer than 3 baseline messages were supplied.
- `flagged_phrases`: phrases whose tone is >25 percentage points off
  baseline on any axis, OR substantially off-target relative to
  target_register. Ordered by severity descending. Each: `{{start_char,
end_char, phrase, axis, delta, note}}`.
- `suggested_rewrite_hint`: short prose hint or null.
- `eval_corpus_slice`: keep as supplied.
- `model_provenance`: `{{mode, provider, model}}`.

Do NOT propose a rewrite. Pair with `rewrite_outgoing` if a rewrite is
desired.
