"""Unit tests for ``get_time_context``."""

from __future__ import annotations

from datetime import UTC, datetime

from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.tools.session import mark_session_start
from neurodock_mcp_chronometric.tools.time_context import get_time_context


def test_nominal_output_shape(frozen_clock: FrozenClock, session_state: SessionState) -> None:
    """Happy path: a fresh process with no session returns valid fields."""

    result = get_time_context(clock=frozen_clock, state=session_state)

    assert result.day_of_week == "Friday"
    assert result.time_since_last_prompt == "PT0S"
    assert result.current_session_length == "PT0S"
    assert result.energy_zone == "morning_peak"
    # ISO 8601 timestamp parses round-trip.
    parsed = datetime.fromisoformat(result.now)
    assert parsed.tzinfo is not None


def test_energy_zone_transitions_across_clock_bands(
    session_state: SessionState,
) -> None:
    """The clock-band heuristic flips on the documented boundaries."""

    cases = [
        (datetime(2026, 5, 15, 7, 0, tzinfo=UTC), "morning_peak"),
        (datetime(2026, 5, 15, 12, 30, tzinfo=UTC), "midday"),
        (datetime(2026, 5, 15, 15, 0, tzinfo=UTC), "afternoon_dip"),
        (datetime(2026, 5, 15, 17, 0, tzinfo=UTC), "evening_quiet"),
        (datetime(2026, 5, 15, 22, 0, tzinfo=UTC), "night_owl_caution"),
        (datetime(2026, 5, 15, 2, 0, tzinfo=UTC), "night_owl_caution"),
    ]
    for stamp, expected_zone in cases:
        clock = FrozenClock(stamp)
        result = get_time_context(clock=clock, state=SessionState())
        assert result.energy_zone == expected_zone, f"{stamp} → {result.energy_zone}"


def test_session_length_resets_after_session_start(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Edge case: starting a session resets current_session_length to PT0S."""

    # Initial read with no session.
    pre = get_time_context(clock=frozen_clock, state=session_state)
    assert pre.current_session_length == "PT0S"

    # Open a session, then advance 5 minutes.
    mark_session_start(intent="write tests", clock=frozen_clock, state=session_state)
    frozen_clock.advance(seconds=300)

    post = get_time_context(clock=frozen_clock, state=session_state)
    # 5 minutes since session start.
    assert post.current_session_length == "PT5M"
    # time_since_last_prompt is measured against the last touch_prompt() call,
    # which was the mark_session_start that opened the session.
    assert post.time_since_last_prompt == "PT5M"
