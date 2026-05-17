"""NeuroDock task fractionator MCP server.

v0.0.1 — implements two tools per ADR 0003 and the JSON Schemas in
``packages/mcp-task-fractionator/schemas/``:

- ``decompose(goal, time_budget?)`` — stateless, local-heuristic decomposition
  into atomic 5..90 minute tasks with required acceptance criteria, a total
  ordering, and dependency edges.
- ``next_one(project)`` — exactly one task for the named project, read from a
  pluggable :class:`PendingTaskSource` (in-memory in v0.0.1; cognitive-graph
  integration is a Phase 2 deliverable).
"""

from neurodock_mcp_task_fractionator.server import build_server
from neurodock_mcp_task_fractionator.sources import (
    CognitiveGraphPendingTaskSource,
    InMemoryPendingTaskSource,
    PendingTaskSource,
    load_pending_task_source,
)

__version__ = "0.0.1"

__all__ = [
    "CognitiveGraphPendingTaskSource",
    "InMemoryPendingTaskSource",
    "PendingTaskSource",
    "__version__",
    "build_server",
    "load_pending_task_source",
]
