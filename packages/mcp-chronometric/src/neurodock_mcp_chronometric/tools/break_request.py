# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``request_break_if_needed`` implementation."""

from __future__ import annotations

from datetime import timedelta

from neurodock_mcp_chronometric.clock import Clock
from neurodock_mcp_chronometric.duration import format_duration
from neurodock_mcp_chronometric.profile import ChronometricProfile
from neurodock_mcp_chronometric.schemas import (
    BreakEscalation,
    BreakSuggestion,
    SuggestedAction,
)
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.windows import matched_protected_window


class ThresholdOutOfRangeError(ValueError):
    """Raised when ``threshold_minutes`` is outside the 1-480 allowed range."""


def request_break_if_needed(
    *,
    threshold_minutes: int,
    clock: Clock,
    state: SessionState,
    profile: ChronometricProfile | None = None,
) -> BreakSuggestion | None:
    """Return a break suggestion when a break is warranted.

    Returns ``None`` when no session is open, the session has not yet reached the
    threshold, and the current local time is not inside a protected window.
    ``null`` is a first-class return value here (per ADR 0001).

    When ``profile`` declares ``protected_windows`` and the current local time
    falls inside one, the suggestion HARD-SURFACES (``escalation="hard_surface"``)
    regardless of the threshold — the window itself is protected, not because the
    session ran long — and the matched window's optional ``label`` is surfaced.
    Inside the protected-window regime but outside any window, the legacy
    threshold behaviour applies with ``escalation="nudge"`` so the two rungs are
    distinguishable. When the profile declares NO protected windows (or is
    ``None``), the ``escalation`` field is left unset, reproducing the exact
    pre-R5 wire shape.
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

    window = matched_protected_window(profile, now) if profile is not None else None
    over_threshold = elapsed >= timedelta(minutes=threshold_minutes)

    # A protected window hard-surfaces on its own; otherwise we only suggest a
    # break once the session has crossed the threshold.
    if window is None and not over_threshold:
        return None

    if window is not None:
        return BreakSuggestion(
            elapsed=format_duration(elapsed),
            prior_intent=open_session.intent,
            suggested_action=_suggested_action_for(elapsed),
            threshold_minutes=threshold_minutes,
            escalation="hard_surface",
            protected_window_label=window.label,
        )

    # Only annotate the rung once a protected-window regime is in play; with no
    # windows configured the escalation field stays unset so the wire shape is
    # byte-identical to the pre-R5 nudge.
    has_windows = profile is not None and bool(profile.protected_windows)
    escalation: BreakEscalation | None = "nudge" if has_windows else None
    return BreakSuggestion(
        elapsed=format_duration(elapsed),
        prior_intent=open_session.intent,
        suggested_action=_suggested_action_for(elapsed),
        threshold_minutes=threshold_minutes,
        escalation=escalation,
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
