# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Implementation of the ``check_tone`` tool.

Scores the outgoing message on three axes via word-list heuristics, computes
``baseline_delta`` when at least three baseline messages were supplied, and
flags phrases whose tone is substantially off-baseline or off-target. Returns
the v0.1.0 output shape plus an LLM-refinement prompt.
"""

from __future__ import annotations

from neurodock_mcp_translation.heuristics.tone import (
    FlaggedPhraseHit,
    ToneScore,
    find_flagged_phrases,
    score_tone,
    target_axes,
)
from neurodock_mcp_translation.prompts import render_prompt
from neurodock_mcp_translation.types import (
    BaselineDelta,
    CheckToneAnalysis,
    CheckToneEnvelope,
    CheckToneInput,
    FlaggedPhrase,
    ModelProvenance,
    PromptForLLMRefinement,
    ToneAxes,
)

EVAL_CORPUS_SLICE = "packages/evals/corpora/translation/tone/v0.1.0/general.jsonl"

_OUTPUT_SCHEMA_REF = "packages/mcp-translation/schemas/check_tone.schema.json"

# Per ADR 0005 §9 / plan.md §7: flag phrases >25 percentage points off baseline.
BASELINE_DELTA_THRESHOLD = 25.0


def _average_score(messages: list[str]) -> ToneScore:
    if not messages:
        return ToneScore(directness=50.0, warmth=50.0, urgency=50.0)
    totals = [score_tone(message) for message in messages]
    n = len(totals)
    return ToneScore(
        directness=sum(s.directness for s in totals) / n,
        warmth=sum(s.warmth for s in totals) / n,
        urgency=sum(s.urgency for s in totals) / n,
    )


def _compute_baseline_delta(axes: ToneScore, baseline_avg: ToneScore) -> BaselineDelta:
    return BaselineDelta(
        directness=round(axes.directness - baseline_avg.directness, 2),
        warmth=round(axes.warmth - baseline_avg.warmth, 2),
        urgency=round(axes.urgency - baseline_avg.urgency, 2),
    )


def _suggested_hint(
    target_register: str | None,
    axes: ToneScore,
    baseline_delta: BaselineDelta | None,
    flagged: list[FlaggedPhraseHit],
) -> str | None:
    if not flagged and not baseline_delta:
        return None
    if target_register == "warm" and axes.warmth < 50:
        return "Lift warmth by opening with a brief relational acknowledgement before the technical content."
    if target_register == "direct" and axes.directness < 60:
        return "Tighten directness: drop hedges and lead with the conclusion."
    if target_register == "concise" and axes.warmth > 60:
        return "Trim relational filler to land in the 'concise' register."
    if baseline_delta and baseline_delta.warmth < -BASELINE_DELTA_THRESHOLD:
        return "Soften: warmth is well below your usual register for this thread."
    if baseline_delta and baseline_delta.directness > BASELINE_DELTA_THRESHOLD:
        return (
            "Consider hedging the strongest claim — directness is well above your usual register."
        )
    if flagged:
        return "Review the flagged phrases; at least one reads off-register for this thread."
    return None


def _flagged_to_schema(hits: list[FlaggedPhraseHit]) -> list[FlaggedPhrase]:
    return [
        FlaggedPhrase(
            start_char=hit.start_char,
            end_char=hit.end_char,
            phrase=hit.phrase,
            axis=hit.axis,  # type: ignore[arg-type]
            delta=hit.delta,
            note=hit.note,
        )
        for hit in hits
    ]


def _deterministic_summary(
    axes: ToneScore,
    axes_target: ToneScore | None,
    baseline_delta: BaselineDelta | None,
    flagged: list[FlaggedPhraseHit],
) -> str:
    lines = [
        f"axes = directness={axes.directness:.1f}, warmth={axes.warmth:.1f}, urgency={axes.urgency:.1f}",
    ]
    if axes_target is not None:
        lines.append(
            "axes_target = "
            f"directness={axes_target.directness:.1f}, warmth={axes_target.warmth:.1f}, "
            f"urgency={axes_target.urgency:.1f}"
        )
    if baseline_delta is not None:
        lines.append(
            f"baseline_delta = directness={baseline_delta.directness:+.1f}, "
            f"warmth={baseline_delta.warmth:+.1f}, urgency={baseline_delta.urgency:+.1f}"
        )
    else:
        lines.append("baseline_delta = null (fewer than 3 baseline messages)")
    if flagged:
        lines.append(
            "flagged_phrases = "
            + ", ".join(f"{hit.phrase!r}({hit.axis} {hit.delta:+.0f})" for hit in flagged)
        )
    else:
        lines.append("flagged_phrases = []")
    return "\n".join(lines)


def check_tone(payload: CheckToneInput) -> CheckToneEnvelope:
    """Run the deterministic baseline and build the LLM-refinement envelope."""

    axes_score = score_tone(payload.text)
    axes = ToneAxes(
        directness=round(axes_score.directness, 2),
        warmth=round(axes_score.warmth, 2),
        urgency=round(axes_score.urgency, 2),
    )

    axes_target_score: ToneScore | None = None
    axes_target: ToneAxes | None = None
    if payload.target_register is not None:
        axes_target_score = target_axes(payload.target_register)
        axes_target = ToneAxes(
            directness=axes_target_score.directness,
            warmth=axes_target_score.warmth,
            urgency=axes_target_score.urgency,
        )

    baseline_messages = payload.baseline_messages or []
    baseline_delta: BaselineDelta | None = None
    if len(baseline_messages) >= 3:
        baseline_avg = _average_score(baseline_messages)
        baseline_delta = _compute_baseline_delta(axes_score, baseline_avg)

    flagged_hits = find_flagged_phrases(payload.text)
    # If baseline_delta is non-null, only keep flags that exceed the threshold on
    # at least one axis. Without a baseline we surface all rule-matched flags.
    if baseline_delta is not None:
        kept: list[FlaggedPhraseHit] = []
        for hit in flagged_hits:
            target_axis_value = getattr(baseline_delta, hit.axis)
            if (
                abs(target_axis_value) >= BASELINE_DELTA_THRESHOLD
                or abs(hit.delta) >= BASELINE_DELTA_THRESHOLD
            ):
                kept.append(hit)
        flagged_hits = kept

    flagged = _flagged_to_schema(flagged_hits)
    hint = _suggested_hint(payload.target_register, axes_score, baseline_delta, flagged_hits)

    analysis = CheckToneAnalysis(
        axes=axes,
        axes_target=axes_target,
        baseline_delta=baseline_delta,
        flagged_phrases=flagged,
        suggested_rewrite_hint=hint,
        eval_corpus_slice=EVAL_CORPUS_SLICE,
        model_provenance=ModelProvenance(mode="unknown", provider="unknown", model="unknown"),
    )

    baseline_block = (
        "\n".join(f"- {message}" for message in baseline_messages)
        if baseline_messages
        else "(none)"
    )

    prompt_content = render_prompt(
        "check_tone",
        text=payload.text,
        channel=payload.channel or "generic",
        target_register=payload.target_register or "(unspecified)",
        baseline_messages=baseline_block,
        deterministic_summary=_deterministic_summary(
            axes_score, axes_target_score, baseline_delta, flagged_hits
        ),
    )

    return CheckToneEnvelope(
        deterministic_analysis=analysis,
        prompt_for_llm_refinement=PromptForLLMRefinement(
            role="user",
            content=prompt_content,
            output_schema_ref=_OUTPUT_SCHEMA_REF,
        ),
        eval_corpus_slice=EVAL_CORPUS_SLICE,
    )
