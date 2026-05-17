"""check_sycophancy v0.0.2 implementation."""

from __future__ import annotations

from neurodock_mcp_guardrail.heuristics.sycophancy import (
    HEURISTIC_DESCRIPTIONS,
    HEURISTIC_VERSION,
    SycophancyMatch,
    SycophancyPattern,
    evaluate,
)
from neurodock_mcp_guardrail.overrides import sycophancy_default_override_options
from neurodock_mcp_guardrail.types import (
    DEFAULT_FP_FEEDBACK_PATH,
    SycophancyHeuristicDescriptor,
    SycophancyInput,
    SycophancyMatchedSpan,
    SycophancyOutput,
    SycophancyOverrideOption,
)


class SycophancyInputMissingError(ValueError):
    """Raised when neither candidate_response nor recent_user_messages is provided."""


_COUNTER_PROMPTS: dict[SycophancyPattern, str] = {
    "unconditional_agreement": (
        "Re-read the user's question and answer it factually with citations. "
        "Disagree where the evidence supports disagreement; name at least one trade-off."
    ),
    "repeated_reassurance_request": (
        "The user has asked for validation of the same decision multiple times. "
        "Do not re-validate. Surface what was already established and ask the user to "
        "add new information before further analysis."
    ),
    "praise_without_evidence": (
        "Re-draft without the opening compliment. Ground each claim in cited evidence "
        "from the conversation so far."
    ),
    "escalating_validation": (
        "Drop the closing compliment. The user did not ask for validation; answer the "
        "question on its merits."
    ),
    "other": (
        "Re-read the user's question and answer it factually with citations. Name "
        "trade-offs even when you agree with the user's stated preference."
    ),
    "none": "",
}


_REASONS: dict[SycophancyPattern, str] = {
    "unconditional_agreement": (
        "Response opens with unconditional agreement and names no trade-off."
    ),
    "repeated_reassurance_request": (
        "Multiple recent user messages contain reassurance markers on the same decision."
    ),
    "praise_without_evidence": (
        "Response opens with absolute praise and contains no citation marker."
    ),
    "escalating_validation": (
        "Short response ends with an unsolicited compliment after no prior solicitation."
    ),
    "other": "Soft signal matched but did not fit a canonical sycophancy bucket.",
    "none": "No sycophancy pattern matched above the confidence threshold.",
}


def _match_to_spans(match: SycophancyMatch) -> list[SycophancyMatchedSpan]:
    spans: list[SycophancyMatchedSpan] = []
    for text, source, at in zip(
        match.matched_spans, match.matched_sources, match.matched_ats, strict=True
    ):
        clipped = text if len(text) <= 1000 else text[:1000]
        spans.append(SycophancyMatchedSpan(source=source, text=clipped, at=at))
    return spans


def check_sycophancy(payload: SycophancyInput) -> SycophancyOutput:
    if payload.candidate_response is None and payload.recent_user_messages is None:
        raise SycophancyInputMissingError(
            "at least one of candidate_response or recent_user_messages is required"
        )

    messages: list[tuple[str, str]] | None = None
    if payload.recent_user_messages is not None:
        messages = [(msg.text, msg.at) for msg in payload.recent_user_messages]

    match = evaluate(
        candidate_response=payload.candidate_response,
        recent_user_messages=messages,
    )

    descriptor = SycophancyHeuristicDescriptor(
        name=match.heuristic_name,
        version=HEURISTIC_VERSION,
        description=HEURISTIC_DESCRIPTIONS[match.heuristic_name],
    )

    spans: list[SycophancyMatchedSpan]
    counter_prompt: str | None
    overrides: list[SycophancyOverrideOption]
    pattern: SycophancyPattern
    reason: str
    if match.detected:
        spans = _match_to_spans(match)
        counter_prompt = _COUNTER_PROMPTS[match.pattern]
        overrides = sycophancy_default_override_options()
        pattern = match.pattern
        reason = _REASONS[match.pattern]
    else:
        spans = []
        counter_prompt = None
        overrides = []
        pattern = "none"
        reason = _REASONS["none"]

    return SycophancyOutput(
        detected=match.detected,
        pattern=pattern,
        confidence=match.confidence,
        matched_spans=spans,
        counter_prompt=counter_prompt,
        reason=reason,
        heuristic=descriptor,
        override_options=overrides,
        false_positive_feedback_path=DEFAULT_FP_FEEDBACK_PATH,
    )
