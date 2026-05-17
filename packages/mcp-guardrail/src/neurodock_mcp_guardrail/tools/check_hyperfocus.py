"""check_hyperfocus v0.0.2 implementation."""

from __future__ import annotations

from datetime import timedelta

from neurodock_mcp_guardrail.heuristics.hyperfocus import (
    HEURISTIC_DESCRIPTION,
    HEURISTIC_NAME,
    HEURISTIC_VERSION,
    HyperfocusLevel,
    HyperfocusThresholds,
    evaluate,
)
from neurodock_mcp_guardrail.overrides import (
    HYPERFOCUS_GENTLE_OVERRIDES,
    HYPERFOCUS_NUDGE_HARD_OVERRIDES,
    hyperfocus_override_options,
)
from neurodock_mcp_guardrail.types import (
    DEFAULT_FP_FEEDBACK_PATH,
    HyperfocusHeuristicDescriptor,
    HyperfocusInput,
    HyperfocusOutput,
    HyperfocusOverrideOption,
    HyperfocusSuggestedAction,
)


class DetectorNotYetImplementedError(RuntimeError):
    """Retained for v0.0.1 import stability; no longer raised."""

    def __init__(self, *, tool: str, phase: str = "3", message: str | None = None) -> None:
        self.tool = tool
        self.phase = phase
        super().__init__(
            message or f"{tool} runtime is not yet implemented; ships in phase {phase}."
        )


class SessionIdMismatchError(ValueError):
    """Raised when both session_id inputs are present but disagree."""


def _build_descriptor() -> HyperfocusHeuristicDescriptor:
    return HyperfocusHeuristicDescriptor(
        name=HEURISTIC_NAME,
        version=HEURISTIC_VERSION,
        description=HEURISTIC_DESCRIPTION,
    )


def _format_iso8601_duration(delta: timedelta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds <= 0:
        total_seconds = 1
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}H")
    if minutes:
        parts.append(f"{minutes}M")
    if seconds or not parts:
        parts.append(f"{seconds}S")
    return "PT" + "".join(parts)


def _suggested_action_for(level: HyperfocusLevel) -> HyperfocusSuggestedAction | None:
    if level == "none":
        return "no_action"
    if level == "gentle":
        return "stand_and_stretch"
    if level == "nudge":
        return "switch_context"
    return "quote_prior_intent_and_offer_close"


def _reason_for(
    level: HyperfocusLevel,
    elapsed_seconds: int,
    end_of_day_local: str | None,
    past_end_of_day: bool,
) -> str:
    elapsed_minutes = elapsed_seconds // 60
    if level == "none" and elapsed_seconds == 0:
        return "No open session; nothing to evaluate."
    if level == "none":
        return f"Session has run {elapsed_minutes} minutes; below the gentle threshold."
    if past_end_of_day and end_of_day_local is not None:
        return (
            f"Session has run {elapsed_minutes} minutes and is past the user's stated "
            f"{end_of_day_local} end-of-day."
        )
    return f"Session has run {elapsed_minutes} minutes."


def check_hyperfocus(payload: HyperfocusInput) -> HyperfocusOutput:
    snapshot = payload.chronometric_snapshot
    open_session = snapshot.open_session

    if (
        payload.session_id is not None
        and open_session is not None
        and payload.session_id != open_session.session_id
    ):
        raise SessionIdMismatchError(
            "input.session_id and chronometric_snapshot.open_session.session_id disagree"
        )

    explicit = payload.escalation_thresholds
    explicit_thresholds: HyperfocusThresholds | None = None
    if explicit is not None:
        explicit_thresholds = HyperfocusThresholds(
            gentle_seconds=explicit.gentle * 60,
            nudge_seconds=explicit.nudge * 60,
            hard_seconds=explicit.hard * 60,
        )

    evaluation = evaluate(
        open_session_elapsed_seconds=(
            None if open_session is None else open_session.elapsed_seconds
        ),
        now_iso=snapshot.now,
        hyperfocus_break_minutes=payload.hyperfocus_break_minutes,
        end_of_day_local=payload.end_of_day_local,
        escalation_thresholds=explicit_thresholds,
    )

    level = evaluation.level
    suggested = _suggested_action_for(level)
    reason = _reason_for(
        level,
        evaluation.elapsed_seconds,
        payload.end_of_day_local,
        evaluation.past_end_of_day,
    )

    overrides: list[HyperfocusOverrideOption] = []
    if level == "gentle":
        overrides = hyperfocus_override_options(HYPERFOCUS_GENTLE_OVERRIDES)
    elif level in ("nudge", "hard"):
        overrides = hyperfocus_override_options(HYPERFOCUS_NUDGE_HARD_OVERRIDES)

    prior_intent: str | None = None if open_session is None else open_session.intent

    time_since_stated_end: str | None = None
    if evaluation.time_since_stated_end is not None:
        time_since_stated_end = _format_iso8601_duration(evaluation.time_since_stated_end)

    return HyperfocusOutput(
        level=level,
        elapsed_seconds=evaluation.elapsed_seconds,
        prior_intent=prior_intent,
        time_since_stated_end=time_since_stated_end,
        suggested_action=suggested,
        confidence=evaluation.confidence,
        reason=reason,
        heuristic=_build_descriptor(),
        override_options=overrides,
        false_positive_feedback_path=DEFAULT_FP_FEEDBACK_PATH,
    )
