# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Thin loader for ``~/.neurodock/profile.yaml``.

Fields the chronometric server reads:

* ``privacy.os_idle_consent`` — gates the OS idle probe.
* ``chronometric.zones`` — optional override of the energy-zone bands
  (forward-compat hook; loader exposes it but server may ignore in v0.0.1).
* ``chronometric.hyperfocus_break_minutes`` / ``chronometric.end_of_day_local``
  — base thresholds, optionally re-anchored per weekday by
  ``chronometric.weekday_overrides`` (R5).
* ``chronometric.weekday_overrides`` — per-weekday overrides of the two base
  thresholds above; keyed by lowercase English weekday name (R5).
* ``chronometric.protected_windows`` — local-time ranges where the hyperfocus
  monitor hard-surfaces rather than nudges; a range whose ``end`` precedes its
  ``start`` wraps past midnight (R5).
* ``chronometric.calendar_phase`` — term/semester phase hint (R5).
* ``chronometric.deadline_cluster_awareness`` — boolean planning hint (R5).
* ``chronometric.motor_fatigue_aware`` — boolean; surfaced so an
  activity-aware client can weight motor fatigue. The chronometric server has
  no keystroke/click stream, so it only *surfaces* this preference; reading
  motor activity stays gated by ``privacy.os_idle_consent`` (R5).

``chronometric.time_buffer_multiplier`` is intentionally NOT read here — it is
consumed by the task-fractionator, not by chronometric.

A ``NEURODOCK_PROFILE_PATH`` environment variable overrides the default path,
which keeps tests fully isolated from the user's filesystem.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, get_args

import yaml

from neurodock_mcp_chronometric.schemas import CalendarPhase

_LOG = logging.getLogger("neurodock_mcp_chronometric.profile")

DEFAULT_PROFILE_PATH = Path.home() / ".neurodock" / "profile.yaml"
PROFILE_PATH_ENV_VAR = "NEURODOCK_PROFILE_PATH"

# Mirrors the profile schema's HH:MM (24h) pattern.
_HHMM_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")

# The seven lowercase weekday keys the schema accepts for weekday_overrides.
# Ordered Monday..Sunday to match ``datetime.weekday()`` (Monday == 0).
WEEKDAY_KEYS: tuple[str, ...] = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)

# ``CalendarPhase`` is defined once in ``schemas.py`` (it owns the output
# contract); the membership set is derived from the Literal's members so it can
# never drift from the type.
_CALENDAR_PHASES: frozenset[str] = frozenset(get_args(CalendarPhase))

# Break-threshold bounds, mirroring the profile schema (hyperfocus_break_minutes
# and the weekday-override counterpart both use 15..240).
_BREAK_MIN = 15
_BREAK_MAX = 240


@dataclass(frozen=True)
class WeekdayOverride:
    """Per-weekday override of the two chronometric thresholds that vary by day.

    Both members are optional; an all-``None`` override means "this weekday is
    named but inherits the top-level values".
    """

    end_of_day_local: str | None = None
    hyperfocus_break_minutes: int | None = None


@dataclass(frozen=True)
class ProtectedWindow:
    """A single local-time range where the hyperfocus monitor hard-surfaces.

    ``start`` and ``end`` are ``HH:MM`` (24h) strings; an ``end`` earlier than
    ``start`` wraps past midnight (handled by the matcher in :mod:`windows`).
    """

    start: str
    end: str
    label: str | None = None


@dataclass(frozen=True)
class ChronometricProfile:
    """Subset of the user's profile relevant to the chronometric server."""

    os_idle_consent: bool
    raw_zones: dict[str, Any] | None
    """Reserved for v0.1.x profile-declared zone overrides — unused in v0.0.1."""

    # R5 additive fields. All optional; absent == today's behaviour.
    hyperfocus_break_minutes: int | None = None
    end_of_day_local: str | None = None
    weekday_overrides: dict[str, WeekdayOverride] = field(default_factory=dict)
    protected_windows: tuple[ProtectedWindow, ...] = ()
    calendar_phase: CalendarPhase | None = None
    deadline_cluster_awareness: bool = False
    motor_fatigue_aware: bool = False


def profile_path() -> Path:
    override = os.environ.get(PROFILE_PATH_ENV_VAR)
    if override:
        return Path(override)
    return DEFAULT_PROFILE_PATH


def _safe_default() -> ChronometricProfile:
    return ChronometricProfile(os_idle_consent=False, raw_zones=None)


def _parse_hhmm(value: Any) -> str | None:
    """Return ``value`` if it is a well-formed HH:MM string, else ``None``."""

    if isinstance(value, str) and _HHMM_RE.match(value):
        return value
    return None


def _parse_break_minutes(value: Any) -> int | None:
    """Return ``value`` if it is an int within the schema's 15..240 range."""

    # bool is a subclass of int; reject it explicitly so True/False never leak.
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and _BREAK_MIN <= value <= _BREAK_MAX:
        return value
    return None


def _parse_weekday_override(raw: Any) -> WeekdayOverride | None:
    """Parse one weekday-override object; ``None`` if it is not a mapping."""

    if not isinstance(raw, dict):
        return None
    return WeekdayOverride(
        end_of_day_local=_parse_hhmm(raw.get("end_of_day_local")),
        hyperfocus_break_minutes=_parse_break_minutes(raw.get("hyperfocus_break_minutes")),
    )


def _parse_weekday_overrides(raw: Any) -> dict[str, WeekdayOverride]:
    """Parse the weekday_overrides map, dropping unknown/misspelt weekday keys."""

    if not isinstance(raw, dict):
        return {}
    result: dict[str, WeekdayOverride] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or key.lower() not in WEEKDAY_KEYS:
            # A misspelt key would be a silent no-op anyway; drop it explicitly.
            continue
        override = _parse_weekday_override(value)
        if override is not None:
            result[key.lower()] = override
    return result


def _parse_protected_window(raw: Any) -> ProtectedWindow | None:
    """Parse one protected-window object; ``None`` when malformed (dropped)."""

    if not isinstance(raw, dict):
        return None
    start = _parse_hhmm(raw.get("start"))
    end = _parse_hhmm(raw.get("end"))
    if start is None or end is None:
        return None
    label_raw = raw.get("label")
    label = label_raw if isinstance(label_raw, str) and label_raw else None
    return ProtectedWindow(start=start, end=end, label=label)


def _parse_protected_windows(raw: Any) -> tuple[ProtectedWindow, ...]:
    """Parse the protected_windows list in declaration order, dropping bad items."""

    if not isinstance(raw, list):
        return ()
    windows: list[ProtectedWindow] = []
    for item in raw:
        window = _parse_protected_window(item)
        if window is not None:
            windows.append(window)
    return tuple(windows)


def _parse_calendar_phase(value: Any) -> CalendarPhase | None:
    """Return ``value`` if it is a recognised calendar-phase enum member."""

    if isinstance(value, str) and value in _CALENDAR_PHASES:
        # value is one of the literal members by the membership check above.
        return value  # type: ignore[return-value]
    return None


def _parse_bool(value: Any) -> bool:
    """Coerce a YAML bool to ``bool``; anything non-bool is ``False``."""

    return value if isinstance(value, bool) else False


def load_profile() -> ChronometricProfile:
    """Load the chronometric subset of the user profile.

    Returns a safe-default profile (consent=False, no zones, neutral R5 fields)
    when the file is missing or unparseable. A structured warning is logged in
    the unparseable case so the omission is visible — never silent. All R5
    fields default to today's behaviour when absent, so an existing profile that
    carries none of them is unchanged.
    """

    path = profile_path()
    if not path.exists():
        return _safe_default()

    try:
        with path.open("r", encoding="utf-8") as fp:
            data = yaml.safe_load(fp) or {}
    except (OSError, yaml.YAMLError) as exc:
        _LOG.warning(
            "profile_unreadable",
            extra={"event": "profile_unreadable", "error_type": type(exc).__name__},
        )
        return _safe_default()

    if not isinstance(data, dict):
        return _safe_default()

    privacy = data.get("privacy")
    consent = False
    if isinstance(privacy, dict):
        consent_raw = privacy.get("os_idle_consent")
        if isinstance(consent_raw, bool):
            consent = consent_raw

    chronometric = data.get("chronometric")
    if not isinstance(chronometric, dict):
        return ChronometricProfile(os_idle_consent=consent, raw_zones=None)

    zones = chronometric.get("zones")
    raw_zones: dict[str, Any] | None = zones if isinstance(zones, dict) else None

    return ChronometricProfile(
        os_idle_consent=consent,
        raw_zones=raw_zones,
        hyperfocus_break_minutes=_parse_break_minutes(chronometric.get("hyperfocus_break_minutes")),
        end_of_day_local=_parse_hhmm(chronometric.get("end_of_day_local")),
        weekday_overrides=_parse_weekday_overrides(chronometric.get("weekday_overrides")),
        protected_windows=_parse_protected_windows(chronometric.get("protected_windows")),
        calendar_phase=_parse_calendar_phase(chronometric.get("calendar_phase")),
        deadline_cluster_awareness=_parse_bool(chronometric.get("deadline_cluster_awareness")),
        motor_fatigue_aware=_parse_bool(chronometric.get("motor_fatigue_aware")),
    )
