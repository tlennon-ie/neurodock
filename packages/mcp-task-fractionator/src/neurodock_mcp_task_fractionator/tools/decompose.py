# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``decompose`` tool implementation.

Thin wrapper around :func:`neurodock_mcp_task_fractionator.decomposer.decompose`.
The server module catches the typed exceptions and translates them to MCP
error codes.
"""

from __future__ import annotations

from neurodock_mcp_task_fractionator.decomposer import (
    UuidFactory,
)
from neurodock_mcp_task_fractionator.decomposer import (
    decompose as _heuristic_decompose,
)
from neurodock_mcp_task_fractionator.types import DecomposeOutput


def decompose(
    *,
    goal: str,
    time_budget: str | None = None,
    max_chunk_size: int | None = None,
    time_buffer_multiplier: float | None = None,
    motor_fatigue_aware: bool | None = None,
    uuid_factory: UuidFactory | None = None,
) -> DecomposeOutput:
    """Decompose ``goal`` into 1..20 atomic tasks. See the module docstring.

    The R2 neurotype hooks (``max_chunk_size``, ``time_buffer_multiplier``,
    ``motor_fatigue_aware``) are optional and additive (ADR 0011); when absent
    the result is byte-identical to the pre-R2 contract.
    """

    return _heuristic_decompose(
        goal=goal,
        time_budget=time_budget,
        max_chunk_size=max_chunk_size,
        time_buffer_multiplier=time_buffer_multiplier,
        motor_fatigue_aware=motor_fatigue_aware,
        uuid_factory=uuid_factory,
    )
