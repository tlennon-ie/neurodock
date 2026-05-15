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
    uuid_factory: UuidFactory | None = None,
) -> DecomposeOutput:
    """Decompose ``goal`` into 1..20 atomic tasks. See the module docstring."""

    return _heuristic_decompose(goal=goal, time_budget=time_budget, uuid_factory=uuid_factory)
