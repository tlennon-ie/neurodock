# hyperfocus-formatter

A passive output transform that runs on every LLM response. It does not change what the model says — it changes how the response is laid out, based on how long the current session has been open.

## When it fires

Every turn, automatically. There is no command to invoke. The skill checks the user's profile and the current session length, then picks one of three tiers:

- **Under 30 minutes.** A light touch: one summary sentence first, then the full response.
- **30 minutes up to the user's configured break threshold** (default 90 minutes). The first line is the answer. Up to `preferences.max_chunk_size` bullets follow. Anything longer goes into a collapsible "more detail" block.
- **At or past the break threshold.** One extra line is prepended: session length, threshold, the user's own stated intent (quoted verbatim), and a suggested action. The response is not blocked. No lecture, no judgement — just the data the user pre-configured themselves to see.

## How to opt out

Set `preferences.output_format: "conventional"` in your profile. The skill becomes a no-op.

## How to tune

- `preferences.max_chunk_size` — bullets in the visible section (default 5, clamped 1–7).
- `chronometric.hyperfocus_break_minutes` — when the Tier-C line appears (default 90).

## References

See `plan.md` §6 (substrate skill spec) and §8 (hyperfocus monitor in the clinical guardrails layer). This skill is the visible surface in Phase 1; the deeper detector (`mcp-guardrail.check_hyperfocus`) lands in Phase 2 and will feed the same Tier-C decision.

## License

AGPL-3.0-or-later.
