# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""ISO 8601 duration formatting.

We only need the ``PnDTnHnMnS`` subset for chronometric outputs. The output is
deterministic, lowercase-safe, and conforms to the regex used in the schemas.
"""

from __future__ import annotations

from datetime import timedelta


def format_duration(delta: timedelta) -> str:
    """Render a non-negative ``timedelta`` as an ISO 8601 duration string.

    A zero or negative duration produces ``"PT0S"`` so callers never have to
    special-case the empty case.
    """

    total_seconds = int(max(delta.total_seconds(), 0))
    if total_seconds == 0:
        return "PT0S"

    days, remainder = divmod(total_seconds, 86_400)
    hours, remainder = divmod(remainder, 3_600)
    minutes, seconds = divmod(remainder, 60)

    parts: list[str] = ["P"]
    if days:
        parts.append(f"{days}D")

    time_parts: list[str] = []
    if hours:
        time_parts.append(f"{hours}H")
    if minutes:
        time_parts.append(f"{minutes}M")
    if seconds:
        time_parts.append(f"{seconds}S")

    if time_parts:
        parts.append("T")
        parts.extend(time_parts)

    return "".join(parts)
