# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for the pure R5 resolution helpers.

These cover the weekday-override resolution (today's effective end-of-day and
hyperfocus break threshold) and protected-window matching, including the
midnight-wrap case where ``end`` < ``start``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from neurodock_mcp_chronometric.profile import ChronometricProfile, ProtectedWindow, WeekdayOverride
from neurodock_mcp_chronometric.windows import (
    matched_protected_window,
    resolve_end_of_day_local,
    resolve_hyperfocus_break_minutes,
)


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


def _local(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    """Build a tz-aware datetime in the SYSTEM-LOCAL zone with these wall-clock
    components.

    Protected windows and end-of-day are declared in the user's LOCAL HH:MM, and
    the matcher/cutoff normalise ``now`` with ``.astimezone()`` (system-local).
    Constructing the test ``now`` in the local frame keeps the asserted
    wall-clock stable on any machine, regardless of its system timezone.
    """

    return datetime(year, month, day, hour, minute).astimezone()


# --------------------------------------------------------------- weekday overrides


def test_end_of_day_uses_base_when_no_override_for_today() -> None:
    """A weekday with no override inherits the top-level end_of_day_local."""

    # 2026-05-15 is a Friday.
    now = datetime(2026, 5, 15, 9, 0, tzinfo=UTC)
    profile = _profile(end_of_day_local="18:30")

    assert resolve_end_of_day_local(profile, now) == "18:30"


def test_end_of_day_applies_todays_override() -> None:
    """A weekday override for today re-anchors end_of_day_local."""

    # Friday.
    now = datetime(2026, 5, 15, 9, 0, tzinfo=UTC)
    profile = _profile(
        end_of_day_local="18:30",
        weekday_overrides={"friday": WeekdayOverride(end_of_day_local="16:00")},
    )

    assert resolve_end_of_day_local(profile, now) == "16:00"


def test_end_of_day_override_for_other_day_does_not_apply() -> None:
    """An override keyed to a different weekday leaves today on the base value."""

    # Friday; override is for Wednesday.
    now = datetime(2026, 5, 15, 9, 0, tzinfo=UTC)
    profile = _profile(
        end_of_day_local="18:30",
        weekday_overrides={"wednesday": WeekdayOverride(end_of_day_local="16:00")},
    )

    assert resolve_end_of_day_local(profile, now) == "18:30"


def test_end_of_day_empty_override_inherits_base() -> None:
    """An empty override object for today inherits the top-level value."""

    now = datetime(2026, 5, 15, 9, 0, tzinfo=UTC)
    profile = _profile(
        end_of_day_local="18:30",
        weekday_overrides={"friday": WeekdayOverride()},
    )

    assert resolve_end_of_day_local(profile, now) == "18:30"


def test_break_minutes_applies_todays_override() -> None:
    """A weekday override for today re-anchors hyperfocus_break_minutes."""

    # Saturday.
    now = datetime(2026, 5, 16, 9, 0, tzinfo=UTC)
    profile = _profile(
        hyperfocus_break_minutes=90,
        weekday_overrides={"saturday": WeekdayOverride(hyperfocus_break_minutes=120)},
    )

    assert resolve_hyperfocus_break_minutes(profile, now) == 120


def test_break_minutes_inherits_base_off_day() -> None:
    """No override for today -> base hyperfocus_break_minutes."""

    now = datetime(2026, 5, 16, 9, 0, tzinfo=UTC)  # Saturday
    profile = _profile(
        hyperfocus_break_minutes=90,
        weekday_overrides={"monday": WeekdayOverride(hyperfocus_break_minutes=45)},
    )

    assert resolve_hyperfocus_break_minutes(profile, now) == 90


def test_break_minutes_none_when_unset() -> None:
    """When nothing is configured, the resolved value is None (caller defaults)."""

    now = datetime(2026, 5, 16, 9, 0, tzinfo=UTC)
    profile = _profile()

    assert resolve_hyperfocus_break_minutes(profile, now) is None


# ------------------------------------------------------------- protected windows


def test_no_protected_windows_matches_nothing() -> None:
    now = _local(2026, 5, 15, 12, 15)
    profile = _profile()

    assert matched_protected_window(profile, now) is None


def test_time_inside_window_matches_and_returns_window() -> None:
    """A time inside a normal (non-wrapping) window matches and is returned."""

    now = _local(2026, 5, 15, 12, 15)
    window = ProtectedWindow(start="12:00", end="12:30", label="lunch")
    profile = _profile(protected_windows=(window,))

    assert matched_protected_window(profile, now) == window


def test_time_outside_window_does_not_match() -> None:
    now = _local(2026, 5, 15, 13, 0)
    window = ProtectedWindow(start="12:00", end="12:30", label="lunch")
    profile = _profile(protected_windows=(window,))

    assert matched_protected_window(profile, now) is None


def test_window_start_is_inclusive() -> None:
    now = _local(2026, 5, 15, 12, 0)
    window = ProtectedWindow(start="12:00", end="12:30", label="lunch")
    profile = _profile(protected_windows=(window,))

    assert matched_protected_window(profile, now) == window


def test_window_end_is_exclusive() -> None:
    """The end minute is exclusive so adjacent windows do not double-match."""

    now = _local(2026, 5, 15, 12, 30)
    window = ProtectedWindow(start="12:00", end="12:30", label="lunch")
    profile = _profile(protected_windows=(window,))

    assert matched_protected_window(profile, now) is None


def test_midnight_wrap_window_matches_late_evening() -> None:
    """A window with end < start wraps past midnight (evening side)."""

    # 23:30 is inside 22:00 -> 06:00.
    now = _local(2026, 5, 15, 23, 30)
    window = ProtectedWindow(start="22:00", end="06:00", label="sleep")
    profile = _profile(protected_windows=(window,))

    assert matched_protected_window(profile, now) == window


def test_midnight_wrap_window_matches_early_morning() -> None:
    """A wrapping window also matches on the early-morning side."""

    # 03:00 is inside 22:00 -> 06:00.
    now = _local(2026, 5, 15, 3, 0)
    window = ProtectedWindow(start="22:00", end="06:00", label="sleep")
    profile = _profile(protected_windows=(window,))

    assert matched_protected_window(profile, now) == window


def test_midnight_wrap_window_excludes_daytime() -> None:
    """A wrapping window does NOT match a time in the open daytime gap."""

    now = _local(2026, 5, 15, 12, 0)
    window = ProtectedWindow(start="22:00", end="06:00", label="sleep")
    profile = _profile(protected_windows=(window,))

    assert matched_protected_window(profile, now) is None


def test_first_matching_window_wins() -> None:
    """When two windows overlap, the first in declaration order is returned."""

    now = _local(2026, 5, 15, 12, 15)
    first = ProtectedWindow(start="12:00", end="13:00", label="lunch")
    second = ProtectedWindow(start="12:10", end="12:20", label="standup")
    profile = _profile(protected_windows=(first, second))

    assert matched_protected_window(profile, now) == first


# ------------------------------------------------------- timezone hardening


def test_window_match_independent_of_carried_offset() -> None:
    """The match is identical for the SAME INSTANT carried in two different tz
    offsets, proving the matcher normalises to a single local frame instead of
    comparing whichever raw wall-clock fields the caller's offset happens to
    carry.

    ``local_dt`` and ``same_instant_utc`` are the same point in time, but their
    naive ``.hour``/``.minute`` fields differ by the +05:30 offset: one reads
    inside a 12:00-12:30 window, the other (the UTC form) reads 06:45 — outside
    it. A correct, offset-independent matcher must return the SAME answer for
    both, since they denote the same instant. This holds on any test machine
    regardless of its system timezone.
    """

    window = ProtectedWindow(start="12:00", end="12:30", label="lunch")
    profile = _profile(protected_windows=(window,))

    plus_530 = timezone(timedelta(hours=5, minutes=30))
    local_dt = datetime(2026, 5, 15, 12, 15, tzinfo=plus_530)
    same_instant_utc = local_dt.astimezone(UTC)

    # Sanity: same instant, divergent naive wall-clock fields (the bug surface).
    assert local_dt == same_instant_utc
    naive_local = local_dt.hour * 60 + local_dt.minute
    naive_utc = same_instant_utc.hour * 60 + same_instant_utc.minute
    assert naive_local != naive_utc
    assert 12 * 60 <= naive_local < 12 * 60 + 30
    assert not (12 * 60 <= naive_utc < 12 * 60 + 30)

    # Offset-independence: both forms of the same instant resolve identically.
    assert matched_protected_window(profile, local_dt) == matched_protected_window(
        profile, same_instant_utc
    )
