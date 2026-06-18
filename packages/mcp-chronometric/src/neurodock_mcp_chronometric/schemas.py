# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Pydantic models for chronometric tool inputs and outputs.

These models are the in-Python source of truth and must round-trip cleanly with
the JSON Schemas under ``packages/mcp-chronometric/schemas/``. Field names,
patterns, and constraints mirror those schemas.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Shared enums

EnergyZone = Literal[
    "morning_peak",
    "midday",
    "afternoon_dip",
    "evening_quiet",
    "night_owl_caution",
    "unknown",
]

DayOfWeek = Literal["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

SuggestedAction = Literal[
    "stand_and_stretch",
    "hydrate",
    "walk_outside",
    "switch_context",
    "end_session",
]

HyperfocusSignal = Literal["active", "switched_away", "unknown"]

# Calendar/semester phase the user self-declares (profile.chronometric.calendar_phase).
# Surfaced additively so planning skills can shift defaults across the term.
CalendarPhase = Literal["teaching", "marking", "exam", "deadlines", "break"]

# Coarse escalation rung for a break suggestion. ``nudge`` is the default rung
# (today's behaviour); ``hard_surface`` is the firm rung, fired when the current
# local time falls inside a profile-declared protected window (R5). The rung is
# surfaced so skills can quote the user's own protected window back to them
# rather than scolding them; the enum value name is NOT user-facing copy.
BreakEscalation = Literal["nudge", "hard_surface"]

# HH:MM (24h) local-time pattern, mirroring the profile schema.
_HHMM_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"

# ISO 8601 duration pattern, mirroring the JSON Schemas. Pydantic v2 uses Rust
# regex which does not support look-ahead, so we validate via a Python re check
# in a field validator rather than as a Field(pattern=...) constraint.
_DURATION_RE = re.compile(r"^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$")

# UUIDv4 string pattern from the JSON Schemas.
_UUID4_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


def _check_duration(value: str) -> str:
    if not _DURATION_RE.match(value):
        raise ValueError(f"invalid ISO 8601 duration: {value!r}")
    return value


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# get_time_context


class TimeContextOutput(_Base):
    now: str
    day_of_week: DayOfWeek
    time_since_last_prompt: str
    current_session_length: str
    energy_zone: EnergyZone

    # R5 additive optional fields. Present only when the profile declares the
    # corresponding input; absent (None) reproduces today's wire shape.
    effective_end_of_day_local: str | None = Field(default=None, pattern=_HHMM_PATTERN)
    past_end_of_day: bool | None = Field(
        default=None,
        description=(
            "True when the local clock has reached 'effective_end_of_day_local' "
            "(inclusive). Reports the fact; the downstream skill decides whether "
            "to surface anything."
        ),
    )
    calendar_phase: CalendarPhase | None = None
    deadline_cluster_awareness: bool | None = None
    motor_fatigue_aware: bool | None = None

    @field_validator("time_since_last_prompt", "current_session_length")
    @classmethod
    def _validate_duration(cls, value: str) -> str:
        return _check_duration(value)


# ---------------------------------------------------------------------------
# mark_session_start


class AutoClosedPriorSession(_Base):
    prior_session_id: str = Field(pattern=_UUID4_PATTERN)
    closed_at: str


class MarkSessionStartInput(_Base):
    intent: str = Field(min_length=1, max_length=500)


class MarkSessionStartOutput(_Base):
    session_id: str = Field(pattern=_UUID4_PATTERN)
    started_at: str
    intent: str
    auto_closed_prior_session: AutoClosedPriorSession | None = None


# ---------------------------------------------------------------------------
# mark_session_end


class MarkSessionEndInput(_Base):
    summary: str | None = Field(default=None, min_length=1, max_length=1000)


class MarkSessionEndOutput(_Base):
    session_id: str = Field(pattern=_UUID4_PATTERN)
    started_at: str
    ended_at: str
    duration: str
    intent: str
    summary: str | None = None

    @field_validator("duration")
    @classmethod
    def _validate_duration(cls, value: str) -> str:
        return _check_duration(value)


# ---------------------------------------------------------------------------
# request_break_if_needed


class RequestBreakInput(_Base):
    threshold_minutes: int = Field(ge=1, le=480)


class BreakSuggestion(_Base):
    elapsed: str
    prior_intent: str
    suggested_action: SuggestedAction
    threshold_minutes: int = Field(ge=1)

    # R5 additive optional fields. ``escalation`` defaults to ``nudge`` (today's
    # behaviour) and rises to ``hard_surface`` (the firm rung) inside a protected
    # window; ``protected_window_label`` carries the matched window's optional
    # label.
    escalation: BreakEscalation | None = Field(
        default=None,
        description=(
            "Coarse escalation rung. 'nudge' (default) when the session crossed "
            "the threshold outside any protected window; 'hard_surface' (the firm "
            "rung) inside a profile-declared protected window. Surfaced so skills "
            "can quote the user's own protected window back to them rather than "
            "scolding them."
        ),
    )
    protected_window_label: str | None = None

    @field_validator("elapsed")
    @classmethod
    def _validate_duration(cls, value: str) -> str:
        return _check_duration(value)


# ---------------------------------------------------------------------------
# idle_status


class IdleStatusOutput(_Base):
    os_idle_seconds: int | None = Field(default=None, ge=0)
    hyperfocus_signal: HyperfocusSignal
    consent_granted: bool
    sampled_at: str | None = None

    # R5 additive optional field. The chronometric server has no keystroke/click
    # stream, so it cannot compute activity-weighted fatigue itself; it surfaces
    # the user's declared preference so a client that DOES have an activity
    # stream knows to weight motor fatigue. Reading motor activity remains gated
    # by ``profile.privacy.os_idle_consent``.
    motor_fatigue_aware: bool | None = None
