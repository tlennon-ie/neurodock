"""Pluggable pending-task sources for ``next_one``.

Per ADR 0003 §1 the task fractionator is stateless. ``next_one`` reads pending
tasks from ``mcp-cognitive-graph``. In v0.0.1 the graph integration is a stub
(it always reports no tasks). Production use will set
``NEURODOCK_TASK_SOURCE=graph`` once the cognitive-graph client ships.

Three exports:

- :class:`PendingTaskSource` — protocol every source implements.
- :class:`InMemoryPendingTaskSource` — local list used by tests and skills
  that already hold the task list in memory.
- :class:`CognitiveGraphPendingTaskSource` — v0.0.1 stub. Returns no tasks.

A factory :func:`load_pending_task_source` picks the right implementation from
``NEURODOCK_TASK_SOURCE`` (default ``memory``).
"""

from __future__ import annotations

from neurodock_mcp_task_fractionator.sources.base import (
    CognitiveGraphUnavailableError,
    PendingTaskSource,
    load_pending_task_source,
)
from neurodock_mcp_task_fractionator.sources.graph import (
    CognitiveGraphPendingTaskSource,
)
from neurodock_mcp_task_fractionator.sources.memory import InMemoryPendingTaskSource

__all__ = [
    "CognitiveGraphPendingTaskSource",
    "CognitiveGraphUnavailableError",
    "InMemoryPendingTaskSource",
    "PendingTaskSource",
    "load_pending_task_source",
]
