# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tool-level tests for the R5 additive output fields.

Per ADR 0011 every new output field is OPTIONAL and additive: it is present only
when the profile declares the corresponding input, and absent (model default
``None`` / falsey) otherwise so an untouched profile reproduces today's wire
shape exactly.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.profile import (
    ChronometricProfile,
    ProtectedWindow,
    WeekdayOverride,
)
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.tools.break_request import request_break_if_needed
from neurodock_mcp_chronometric.tools.idle import idle_status
from neurodock_mcp_chronometric.tools.session import mark_session_start
from neurodock_mcp_chronometric.tools.time_context import get_time_context


def _profile(**kwargs: object) -> ChronometricProfile:
    base: dict[str, object] = {
        "os_idle_consent": False,
        "raw_zones": None,
        "hyperfocus_break_minutes": None,
        "end_of_day_local": None,
        "weekday_overrides": {},
        "protected_windows": (),
        "calendar_phase": None,
        "deadline_cluster_awareness": False,
        "motor_fatigue_aware": False,
    }
    base.update(kwargs)
    return ChronometricProfile(**base)  # type: ignore[arg-type]


def _local_clock(year: int, month: int, day: int, hour: int, minute: int = 0) -> FrozenClock:
    """A FrozenClock anchored in the SYSTEM-LOCAL zone at these wall-clock parts.

    Protected windows and end-of-day are declared in the user's LOCAL HH:MM, and
    the tools normalise ``now`` with ``.astimezone()`` (system-local). Anchoring
    the clock in the local frame keeps wall-clock-sensitive assertions (window
    membership, end-of-day cutoff) stable on any machine regardless of its
    system timezone.
    """

    return FrozenClock(datetime(year, month, day, hour, minute).astimezone())


# ---------------------------------------------------------------- get_time_context


def test_time_context_without_profile_omits_new_fields() -> None:
    """No profile -> none of the R5 fields are emitted (today's shape)."""

    clock = FrozenClock(datetime(2026, 5, 15, 9, 0, tzinfo=UTC))
    result = get_time_context(clock=clock, state=SessionState())

    dumped = result.model_dump(exclude_none=True)
    assert "effective_end_of_day_local" not in dumped
    assert "past_end_of_day" not in dumped
    assert "calendar_phase" not in dumped
    assert "deadline_cluster_awareness" not in dumped
    assert "motor_fatigue_aware" not in dumped


def test_time_context_surfaces_calendar_phase_and_hints() -> None:
    """calendar_phase + the boolean hints flow into the additive fields."""

    clock = FrozenClock(datetime(2026, 5, 15, 9, 0, tzinfo=UTC))
    profile = _profile(
        calendar_phase="marking",
        deadline_cluster_awareness=True,
        motor_fatigue_aware=True,
    )

    result = get_time_context(clock=clock, state=SessionState(), profile=profile)

    assert result.calendar_phase == "marking"
    assert result.deadline_cluster_awareness is True
    assert result.motor_fatigue_aware is True


def test_time_context_effective_end_of_day_applies_weekday_override() -> None:
    """The effective end-of-day reflects today's weekday override."""

    # 2026-05-15 is a Friday (local frame so the cutoff compare is deterministic).
    clock = _local_clock(2026, 5, 15, 9, 0)
    profile = _profile(
        end_of_day_local="18:30",
        weekday_overrides={"friday": WeekdayOverride(end_of_day_local="16:00")},
    )

    result = get_time_context(clock=clock, state=SessionState(), profile=profile)

    assert result.effective_end_of_day_local == "16:00"
    # 09:00 is before 16:00, so not past end of day.
    assert result.past_end_of_day is False


def test_time_context_past_end_of_day_true_after_cutoff() -> None:
    """past_end_of_day is True once the local clock is at/after the cutoff."""

    clock = _local_clock(2026, 5, 15, 19, 0)  # Friday evening, local frame
    profile = _profile(end_of_day_local="18:30")

    result = get_time_context(clock=clock, state=SessionState(), profile=profile)

    assert result.effective_end_of_day_local == "18:30"
    assert result.past_end_of_day is True


def test_time_context_past_end_of_day_true_at_exact_cutoff() -> None:
    """The cutoff boundary is inclusive: at exactly HH:MM, past_end_of_day is True."""

    # Frozen exactly at the 18:30 cutoff (local frame so the boundary is stable).
    clock = _local_clock(2026, 5, 15, 18, 30)
    profile = _profile(end_of_day_local="18:30")

    result = get_time_context(clock=clock, state=SessionState(), profile=profile)

    assert result.effective_end_of_day_local == "18:30"
    assert result.past_end_of_day is True


def test_time_context_past_end_of_day_independent_of_carried_offset() -> None:
    """The cutoff comparison normalises to a single local frame, so the SAME
    INSTANT carried in two different tz offsets yields the same past_end_of_day.

    The two clocks denote one instant whose naive wall-clock minute differs by
    +05:30 — one side reads after an 18:30 cutoff, the UTC side reads before it.
    A correct, offset-independent comparison returns the same answer for both.
    Holds on any test machine regardless of its system timezone.
    """

    profile = _profile(end_of_day_local="18:30")

    plus_530 = timezone(timedelta(hours=5, minutes=30))
    local_dt = datetime(2026, 5, 15, 19, 0, tzinfo=plus_530)  # local 19:00, past cutoff
    same_instant_utc = local_dt.astimezone(UTC)  # 13:30 UTC, naive-before cutoff

    # Sanity: same instant, divergent naive wall-clock fields (the bug surface).
    assert local_dt == same_instant_utc
    naive_local = local_dt.hour * 60 + local_dt.minute
    naive_utc = same_instant_utc.hour * 60 + same_instant_utc.minute
    assert naive_local != naive_utc
    assert naive_local >= 18 * 60 + 30
    assert naive_utc < 18 * 60 + 30

    local_result = get_time_context(
        clock=FrozenClock(local_dt), state=SessionState(), profile=profile
    )
    utc_result = get_time_context(
        clock=FrozenClock(same_instant_utc), state=SessionState(), profile=profile
    )
    assert local_result.past_end_of_day == utc_result.past_end_of_day


# ---------------------------------------------------------- request_break_if_needed


def test_break_below_threshold_outside_window_still_none() -> None:
    """Profile present but session short and not in a window: still None."""

    clock = _local_clock(2026, 5, 15, 9, 0)
    state = SessionState()
    mark_session_start(intent="work", clock=clock, state=state)
    clock.advance(seconds=60)

    profile = _profile(protected_windows=(ProtectedWindow(start="12:00", end="12:30"),))
    result = request_break_if_needed(
        threshold_minutes=90, clock=clock, state=state, profile=profile
    )
    assert result is None


def test_break_over_threshold_in_window_regime_is_nudge() -> None:
    """Over threshold, windows configured but none matching -> escalation 'nudge'."""

    # 09:00 is outside the 12:00-13:00 window, so we get the nudge rung but the
    # field is annotated because a protected-window regime is in play.
    clock = _local_clock(2026, 5, 15, 9, 0)
    state = SessionState()
    mark_session_start(intent="finish RFC", clock=clock, state=state)
    clock.advance(seconds=91 * 60)  # now 10:31, still outside the window

    profile = _profile(
        protected_windows=(ProtectedWindow(start="12:00", end="13:00", label="lunch"),)
    )
    result = request_break_if_needed(
        threshold_minutes=90, clock=clock, state=state, profile=profile
    )
    assert result is not None
    assert result.escalation == "nudge"
    assert result.protected_window_label is None


def test_break_inside_protected_window_hard_surfaces() -> None:
    """Inside a protected window, even an over-threshold break hard-surfaces."""

    # Start at 11:00, advance 91 minutes -> 12:31. Window 12:00-13:00 matches.
    clock = _local_clock(2026, 5, 15, 11, 0)
    state = SessionState()
    mark_session_start(intent="finish RFC", clock=clock, state=state)
    clock.advance(seconds=91 * 60)  # now 12:31

    profile = _profile(
        protected_windows=(ProtectedWindow(start="12:00", end="13:00", label="lunch"),)
    )
    result = request_break_if_needed(
        threshold_minutes=90, clock=clock, state=state, profile=profile
    )
    assert result is not None
    assert result.escalation == "hard_surface"
    assert result.protected_window_label == "lunch"


def test_break_inside_protected_window_fires_below_threshold() -> None:
    """A protected window hard-surfaces because the window is protected, not
    because the session ran long: it fires even below the break threshold."""

    # Start at 12:05, advance 1 minute -> 12:06, well under 90 min.
    clock = _local_clock(2026, 5, 15, 12, 5)
    state = SessionState()
    mark_session_start(intent="quick fix", clock=clock, state=state)
    clock.advance(seconds=60)

    profile = _profile(
        protected_windows=(ProtectedWindow(start="12:00", end="13:00", label="lunch"),)
    )
    result = request_break_if_needed(
        threshold_minutes=90, clock=clock, state=state, profile=profile
    )
    assert result is not None
    assert result.escalation == "hard_surface"
    assert result.protected_window_label == "lunch"
    # prior_intent is still quoted verbatim.
    assert result.prior_intent == "quick fix"


def test_break_hard_surface_without_label_omits_label_field() -> None:
    """A labelless protected window still hard-surfaces; the label field stays
    None and is dropped from the exclude_none wire payload."""

    # Start at 12:05, advance 1 minute -> 12:06, inside an unlabelled window.
    clock = _local_clock(2026, 5, 15, 12, 5)
    state = SessionState()
    mark_session_start(intent="quick fix", clock=clock, state=state)
    clock.advance(seconds=60)

    profile = _profile(protected_windows=(ProtectedWindow(start="12:00", end="13:00"),))
    result = request_break_if_needed(
        threshold_minutes=90, clock=clock, state=state, profile=profile
    )
    assert result is not None
    assert result.escalation == "hard_surface"
    assert result.protected_window_label is None
    assert "protected_window_label" not in result.model_dump(exclude_none=True)


def test_break_no_session_returns_none_even_in_window() -> None:
    """No open session: nothing to break from, even inside a protected window."""

    clock = FrozenClock(datetime(2026, 5, 15, 12, 15, tzinfo=UTC))
    profile = _profile(
        protected_windows=(ProtectedWindow(start="12:00", end="13:00", label="lunch"),)
    )
    result = request_break_if_needed(
        threshold_minutes=90, clock=clock, state=SessionState(), profile=profile
    )
    assert result is None


def test_break_without_profile_leaves_escalation_unset() -> None:
    """Backward-compat: no profile -> escalation/label unset (pre-R5 wire shape)."""

    clock = FrozenClock(datetime(2026, 5, 15, 9, 0, tzinfo=UTC))
    state = SessionState()
    mark_session_start(intent="work", clock=clock, state=state)
    clock.advance(seconds=91 * 60)

    result = request_break_if_needed(threshold_minutes=90, clock=clock, state=state)
    assert result is not None
    assert result.escalation is None
    assert result.protected_window_label is None
    # Wire shape is exactly the pre-R5 set of keys.
    assert set(result.model_dump(exclude_none=True).keys()) == {
        "elapsed",
        "prior_intent",
        "suggested_action",
        "threshold_minutes",
    }


# ----------------------------------------------------------------------- idle_status


def test_idle_status_surfaces_motor_fatigue_aware_flag() -> None:
    """idle_status echoes motor_fatigue_aware so an activity-aware client knows."""

    clock = FrozenClock(datetime(2026, 5, 15, 9, 0, tzinfo=UTC))
    profile = _profile(os_idle_consent=True, motor_fatigue_aware=True)

    result = idle_status(clock=clock, profile=profile)
    assert result.motor_fatigue_aware is True


def test_idle_status_motor_fatigue_absent_by_default() -> None:
    """When the flag is unset, the field is None and dropped from exclude_none."""

    clock = FrozenClock(datetime(2026, 5, 15, 9, 0, tzinfo=UTC))
    profile = _profile(os_idle_consent=True)

    result = idle_status(clock=clock, profile=profile)
    assert result.motor_fatigue_aware is None
    assert "motor_fatigue_aware" not in result.model_dump(exclude_none=True)
