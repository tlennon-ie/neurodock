# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Implementation of the ``get_time_context`` tool."""

from __future__ import annotations

from datetime import timedelta

from neurodock_mcp_chronometric.clock import Clock
from neurodock_mcp_chronometric.duration import format_duration
from neurodock_mcp_chronometric.energy_zone import compute_energy_zone
from neurodock_mcp_chronometric.schemas import DayOfWeek, TimeContextOutput
from neurodock_mcp_chronometric.state import SessionState

_DAY_NAMES: tuple[DayOfWeek, ...] = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)


def get_time_context(*, clock: Clock, state: SessionState) -> TimeContextOutput:
    """Return the current time context (see schema for full description).

    Side effects: updates the server's ``last_prompt_at`` marker so the next
    call computes ``time_since_last_prompt`` relative to this call.
    """

    now = clock.now()
    previous = state.touch_prompt(now)
    time_since_last = (now - previous) if previous is not None else timedelta(0)

    open_session = state.current_open()
    session_length = (now - open_session.started_at) if open_session else timedelta(0)

    return TimeContextOutput(
        now=now.isoformat(),
        day_of_week=_DAY_NAMES[now.weekday()],
        time_since_last_prompt=format_duration(time_since_last),
        current_session_length=format_duration(session_length),
        energy_zone=compute_energy_zone(now),
    )
