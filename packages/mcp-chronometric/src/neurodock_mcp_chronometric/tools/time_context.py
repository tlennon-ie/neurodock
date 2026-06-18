# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Implementation of the ``get_time_context`` tool."""

from __future__ import annotations

from datetime import datetime, timedelta

from neurodock_mcp_chronometric.clock import Clock
from neurodock_mcp_chronometric.duration import format_duration
from neurodock_mcp_chronometric.energy_zone import compute_energy_zone
from neurodock_mcp_chronometric.profile import ChronometricProfile
from neurodock_mcp_chronometric.schemas import DayOfWeek, TimeContextOutput
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.windows import resolve_end_of_day_local

_DAY_NAMES: tuple[DayOfWeek, ...] = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)


def get_time_context(
    *,
    clock: Clock,
    state: SessionState,
    profile: ChronometricProfile | None = None,
) -> TimeContextOutput:
    """Return the current time context (see schema for full description).

    Side effects: updates the server's ``last_prompt_at`` marker so the next
    call computes ``time_since_last_prompt`` relative to this call.

    When ``profile`` is provided, the R5 additive fields are populated from it:
    ``effective_end_of_day_local`` (today's weekday-resolved end-of-day),
    ``past_end_of_day`` (whether the local clock has reached that cutoff), and
    the surfaced ``calendar_phase`` / ``deadline_cluster_awareness`` /
    ``motor_fatigue_aware`` hints. When ``profile`` is ``None`` (or declares none
    of these), every R5 field stays ``None`` so the wire shape is unchanged.
    """

    now = clock.now()
    previous = state.touch_prompt(now)
    time_since_last = (now - previous) if previous is not None else timedelta(0)

    open_session = state.current_open()
    session_length = (now - open_session.started_at) if open_session else timedelta(0)

    effective_end_of_day: str | None = None
    past_end_of_day: bool | None = None
    calendar_phase = None
    deadline_cluster_awareness: bool | None = None
    motor_fatigue_aware: bool | None = None

    if profile is not None:
        effective_end_of_day = resolve_end_of_day_local(profile, now)
        if effective_end_of_day is not None:
            past_end_of_day = _is_past_cutoff(now, effective_end_of_day)
        calendar_phase = profile.calendar_phase
        # Surface the boolean hints only when set so an untouched profile keeps
        # the field absent under exclude_none. The False->None collapse is
        # intentional: a hint the user did not opt into must not appear on the
        # wire at all (per ADR 0011 additivity), so we never emit ``false`` —
        # only ``true`` when opted in, or omit the field entirely.
        if profile.deadline_cluster_awareness:
            deadline_cluster_awareness = True
        if profile.motor_fatigue_aware:
            motor_fatigue_aware = True

    return TimeContextOutput(
        now=now.isoformat(),
        day_of_week=_DAY_NAMES[now.weekday()],
        time_since_last_prompt=format_duration(time_since_last),
        current_session_length=format_duration(session_length),
        energy_zone=compute_energy_zone(now),
        effective_end_of_day_local=effective_end_of_day,
        past_end_of_day=past_end_of_day,
        calendar_phase=calendar_phase,
        deadline_cluster_awareness=deadline_cluster_awareness,
        motor_fatigue_aware=motor_fatigue_aware,
    )


def _is_past_cutoff(now: datetime, hhmm: str) -> bool:
    """Whether ``now``'s local clock has reached the ``HH:MM`` cutoff (inclusive).

    Local-wall-clock contract: ``hhmm`` is the user's declared LOCAL end-of-day,
    so ``now`` is normalised with ``.astimezone()`` before its minute-of-day is
    read. The result is independent of which tz offset the caller's ``datetime``
    carries (e.g. a UTC-tz clock compares the user's local time, not raw UTC
    hours). ``hhmm`` is pre-validated HH:MM, so the split + int parse cannot
    raise here.
    """

    hour_str, minute_str = hhmm.split(":")
    cutoff_minute = int(hour_str) * 60 + int(minute_str)
    local = now.astimezone()
    return (local.hour * 60 + local.minute) >= cutoff_minute
