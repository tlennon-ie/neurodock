"""``request_break_if_needed`` implementation."""

from __future__ import annotations

from datetime import timedelta

from neurodock_mcp_chronometric.clock import Clock
from neurodock_mcp_chronometric.duration import format_duration
from neurodock_mcp_chronometric.schemas import BreakSuggestion, SuggestedAction
from neurodock_mcp_chronometric.state import SessionState


class ThresholdOutOfRangeError(ValueError):
    """Raised when ``threshold_minutes`` is outside the 1-480 allowed range."""


def request_break_if_needed(
    *, threshold_minutes: int, clock: Clock, state: SessionState
) -> BreakSuggestion | None:
    """Return a break suggestion when the open session has exceeded the threshold.

    Returns ``None`` when no session is open or the session has not yet reached
    the threshold. ``null`` is a first-class return value here (per ADR 0001).
    """

    if not isinstance(threshold_minutes, int) or isinstance(threshold_minutes, bool):
        raise ThresholdOutOfRangeError("threshold_minutes must be an integer")
    if threshold_minutes < 1 or threshold_minutes > 480:
        raise ThresholdOutOfRangeError("threshold_minutes must be in the range 1..480 inclusive")

    open_session = state.current_open()
    if open_session is None:
        return None

    now = clock.now()
    elapsed = now - open_session.started_at
    if elapsed < timedelta(minutes=threshold_minutes):
        return None

    return BreakSuggestion(
        elapsed=format_duration(elapsed),
        prior_intent=open_session.intent,
        suggested_action=_suggested_action_for(elapsed),
        threshold_minutes=threshold_minutes,
    )


def _suggested_action_for(elapsed: timedelta) -> SuggestedAction:
    """Pick a coarse next action based on how long the session has run."""

    minutes = elapsed.total_seconds() / 60.0
    if minutes >= 180:
        return "end_session"
    if minutes >= 120:
        return "walk_outside"
    if minutes >= 90:
        return "stand_and_stretch"
    return "hydrate"
