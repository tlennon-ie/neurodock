# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Energy-zone heuristic (v0.1.0 clock-band table from ADR 0001).

The mapping intentionally lives in one small module so the heuristic is
auditable and so a future replacement (profile-declared zones, adaptive
heuristic) can swap it out without touching tool code.
"""

from __future__ import annotations

from datetime import datetime

from neurodock_mcp_chronometric.schemas import EnergyZone


def compute_energy_zone(now: datetime) -> EnergyZone:
    """Map a local wall-clock time to an :data:`EnergyZone` bucket.

    The bands are taken verbatim from the ADR. ``now`` must be tz-aware; if not,
    we fall back to ``"unknown"`` rather than guessing.
    """

    if now.tzinfo is None:
        return "unknown"

    minute_of_day = now.hour * 60 + now.minute

    # Bands, in [start_minute, end_minute_exclusive). 05:00 -> 300, 09:00 -> 540, etc.
    if 300 <= minute_of_day < 720:  # 05:00 - 12:00
        return "morning_peak"
    if 720 <= minute_of_day < 840:  # 12:00 - 14:00
        return "midday"
    if 840 <= minute_of_day < 990:  # 14:00 - 16:30
        return "afternoon_dip"
    if 990 <= minute_of_day < 1170:  # 16:30 - 19:30
        return "evening_quiet"
    # 19:30 - 05:00 wraps midnight.
    return "night_owl_caution"
