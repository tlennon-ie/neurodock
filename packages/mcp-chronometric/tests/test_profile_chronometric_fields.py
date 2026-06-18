# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for the R5 chronometric profile fields (loader + resolution).

These exercise the loader's parsing of the optional fields added in R5 part A
to ``packages/core/schemas/profile.schema.json`` under ``chronometric``:
``weekday_overrides``, ``protected_windows``, ``calendar_phase``,
``deadline_cluster_awareness`` and ``motor_fatigue_aware``. ``time_buffer_multiplier``
is deliberately NOT read here — it is consumed by the task-fractionator.
"""

from __future__ import annotations

from pathlib import Path

from neurodock_mcp_chronometric.profile import (
    ProtectedWindow,
    WeekdayOverride,
    load_profile,
)

from .conftest import write_profile


def test_absent_fields_default_to_today_behaviour(isolated_profile_path: Path) -> None:
    """Backward-compat: a profile without any R5 field loads the neutral defaults."""

    write_profile(
        isolated_profile_path,
        {"privacy": {"os_idle_consent": True}, "chronometric": {"hyperfocus_break_minutes": 90}},
    )
    profile = load_profile()

    assert profile.os_idle_consent is True
    assert profile.hyperfocus_break_minutes == 90
    assert profile.end_of_day_local is None
    assert profile.weekday_overrides == {}
    assert profile.protected_windows == ()
    assert profile.calendar_phase is None
    assert profile.deadline_cluster_awareness is False
    assert profile.motor_fatigue_aware is False


def test_empty_profile_loads_all_neutral(isolated_profile_path: Path) -> None:
    """A completely empty profile file yields the same neutral defaults."""

    write_profile(isolated_profile_path, {})
    profile = load_profile()

    assert profile.hyperfocus_break_minutes is None
    assert profile.end_of_day_local is None
    assert profile.weekday_overrides == {}
    assert profile.protected_windows == ()
    assert profile.calendar_phase is None
    assert profile.deadline_cluster_awareness is False
    assert profile.motor_fatigue_aware is False


def test_top_level_chronometric_thresholds_are_read(isolated_profile_path: Path) -> None:
    """The base end_of_day_local and hyperfocus_break_minutes parse through."""

    write_profile(
        isolated_profile_path,
        {
            "chronometric": {
                "hyperfocus_break_minutes": 60,
                "end_of_day_local": "18:30",
            }
        },
    )
    profile = load_profile()

    assert profile.hyperfocus_break_minutes == 60
    assert profile.end_of_day_local == "18:30"


def test_weekday_overrides_parse_into_typed_map(isolated_profile_path: Path) -> None:
    """weekday_overrides keys map to WeekdayOverride values."""

    write_profile(
        isolated_profile_path,
        {
            "chronometric": {
                "weekday_overrides": {
                    "wednesday": {"end_of_day_local": "18:30"},
                    "saturday": {"hyperfocus_break_minutes": 120},
                    "monday": {},
                }
            }
        },
    )
    profile = load_profile()

    assert profile.weekday_overrides["wednesday"] == WeekdayOverride(
        end_of_day_local="18:30", hyperfocus_break_minutes=None
    )
    assert profile.weekday_overrides["saturday"] == WeekdayOverride(
        end_of_day_local=None, hyperfocus_break_minutes=120
    )
    # An empty override object is valid (named but inherits).
    assert profile.weekday_overrides["monday"] == WeekdayOverride(
        end_of_day_local=None, hyperfocus_break_minutes=None
    )


def test_unknown_weekday_key_is_ignored(isolated_profile_path: Path) -> None:
    """A misspelt weekday key is a silent no-op (dropped), never crashes."""

    write_profile(
        isolated_profile_path,
        {"chronometric": {"weekday_overrides": {"funday": {"hyperfocus_break_minutes": 30}}}},
    )
    profile = load_profile()

    assert "funday" not in profile.weekday_overrides
    assert profile.weekday_overrides == {}


def test_protected_windows_parse_in_order(isolated_profile_path: Path) -> None:
    """protected_windows parse into an ordered tuple of ProtectedWindow."""

    write_profile(
        isolated_profile_path,
        {
            "chronometric": {
                "protected_windows": [
                    {"start": "12:00", "end": "12:30", "label": "lunch"},
                    {"start": "17:00", "end": "23:59"},
                ]
            }
        },
    )
    profile = load_profile()

    assert profile.protected_windows == (
        ProtectedWindow(start="12:00", end="12:30", label="lunch"),
        ProtectedWindow(start="17:00", end="23:59", label=None),
    )


def test_malformed_protected_window_is_dropped(isolated_profile_path: Path) -> None:
    """A window missing start/end or with a bad time string is skipped, not fatal."""

    write_profile(
        isolated_profile_path,
        {
            "chronometric": {
                "protected_windows": [
                    {"start": "12:00", "end": "12:30", "label": "lunch"},
                    {"start": "nope", "end": "12:30"},
                    {"end": "12:30"},
                    "garbage",
                ]
            }
        },
    )
    profile = load_profile()

    assert profile.protected_windows == (
        ProtectedWindow(start="12:00", end="12:30", label="lunch"),
    )


def test_calendar_phase_and_boolean_hints_parse(isolated_profile_path: Path) -> None:
    """calendar_phase enum + the two boolean hints parse through."""

    write_profile(
        isolated_profile_path,
        {
            "chronometric": {
                "calendar_phase": "marking",
                "deadline_cluster_awareness": True,
                "motor_fatigue_aware": True,
            }
        },
    )
    profile = load_profile()

    assert profile.calendar_phase == "marking"
    assert profile.deadline_cluster_awareness is True
    assert profile.motor_fatigue_aware is True


def test_invalid_calendar_phase_is_dropped(isolated_profile_path: Path) -> None:
    """An out-of-enum calendar_phase is ignored rather than surfaced."""

    write_profile(
        isolated_profile_path,
        {"chronometric": {"calendar_phase": "vacation"}},
    )
    profile = load_profile()

    assert profile.calendar_phase is None
