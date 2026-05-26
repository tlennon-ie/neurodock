# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Source protocol + factory for pluggable pending-task sources."""

from __future__ import annotations

import os
from typing import Protocol, runtime_checkable

from neurodock_mcp_task_fractionator.types import Task

# Environment variable used by :func:`load_pending_task_source`.
TASK_SOURCE_ENV_VAR = "NEURODOCK_TASK_SOURCE"

# Allowed values for ``NEURODOCK_TASK_SOURCE``. Tests assert on this set.
ALLOWED_SOURCES: frozenset[str] = frozenset({"memory", "graph"})

# Default mode for v0.0.1. ``memory`` keeps the boundary clean; ``graph`` will
# become the default once the cognitive-graph client ships.
DEFAULT_SOURCE_MODE = "memory"


class CognitiveGraphUnavailableError(RuntimeError):
    """Raised when the graph-backed source cannot be reached.

    Surfaces as the ``COGNITIVE_GRAPH_UNAVAILABLE`` error code at the server
    boundary. In v0.0.1 the graph source always raises this (it is a stub).
    """


@runtime_checkable
class PendingTaskSource(Protocol):
    """A read-only source of pending tasks scoped to a project.

    Implementations MUST be side-effect-free reads. The fractionator itself
    is stateless; mutation is the caller's responsibility.
    """

    def list_pending(self, project: str) -> list[Task]:
        """Return all pending tasks for ``project``, in any order.

        Sorting and selection (sequence=1 unblocked) is done by ``next_one``,
        not the source. Implementations should not filter on completion
        state beyond "not yet done".
        """
        ...


def load_pending_task_source(
    *,
    in_memory: PendingTaskSource | None = None,
    graph: PendingTaskSource | None = None,
    env: dict[str, str] | None = None,
) -> PendingTaskSource:
    """Pick a source per the ``NEURODOCK_TASK_SOURCE`` env var.

    Test code can pass pre-built instances for both modes; production code
    leaves ``in_memory`` and ``graph`` unset and lets the factory construct
    fresh defaults.
    """

    environment = env if env is not None else os.environ
    raw = environment.get(TASK_SOURCE_ENV_VAR, DEFAULT_SOURCE_MODE).strip().lower()
    if raw not in ALLOWED_SOURCES:
        raw = DEFAULT_SOURCE_MODE

    if raw == "graph":
        # Local import to avoid a cycle at module top: graph imports base.
        from neurodock_mcp_task_fractionator.sources.graph import (
            CognitiveGraphPendingTaskSource,
        )

        return graph if graph is not None else CognitiveGraphPendingTaskSource()

    from neurodock_mcp_task_fractionator.sources.memory import InMemoryPendingTaskSource

    return in_memory if in_memory is not None else InMemoryPendingTaskSource()


# Concrete classes (InMemoryPendingTaskSource, CognitiveGraphPendingTaskSource)
# live in sibling modules and import this module's Protocol. To avoid a cyclic
# import that CodeQL flagged as `py/unsafe-cyclic-import`, the factory
# function's `in_memory` / `graph` parameters are typed as the Protocol itself
# (`PendingTaskSource | None`) rather than the concrete classes. Callers pass
# the right concrete subclass; the Protocol gives them structural typing.
