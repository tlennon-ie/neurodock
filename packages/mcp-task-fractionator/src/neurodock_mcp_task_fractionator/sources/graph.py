# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Cognitive-graph-backed pending-task source.

v0.0.1 stub: the cognitive-graph client is being built in a parallel agent run
and is not importable from this package yet. We surface that gap as
``COGNITIVE_GRAPH_UNAVAILABLE`` at the server boundary, exactly as ADR 0003
prescribes for the runtime case.

# TODO: wire to mcp-cognitive-graph client when its package ships.
"""

from __future__ import annotations

from neurodock_mcp_task_fractionator.sources.base import (
    CognitiveGraphUnavailableError,
)
from neurodock_mcp_task_fractionator.types import Task


class CognitiveGraphPendingTaskSource:
    """Returns no tasks; signals UNAVAILABLE on every read.

    Tests pinning the v0.2 behaviour will replace this class with a real
    client wrapper. The class is kept here so the env-var contract
    (``NEURODOCK_TASK_SOURCE=graph``) is honoured today.
    """

    def list_pending(self, project: str) -> list[Task]:
        """Always raise — see module docstring."""

        # ``project`` is intentionally unused; the stub does not branch on it.
        del project
        raise CognitiveGraphUnavailableError(
            "cognitive-graph client not wired in v0.0.1; "
            "set NEURODOCK_TASK_SOURCE=memory or pass a source explicitly"
        )
