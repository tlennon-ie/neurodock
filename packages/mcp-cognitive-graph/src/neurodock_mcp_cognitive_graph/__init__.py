"""NeuroDock cognitive graph MCP server.

Persistent entity memory and recall, exposed as an MCP server. Implements the
four tools defined in `plan.md` Section 6 and the schemas under
`packages/mcp-cognitive-graph/schemas/`:

- ``recall_entity`` — alias-resolve a name and return entity + facts + neighbours.
- ``record_fact``  — persist a typed-edge (subject, predicate, object) fact.
- ``recall_decisions`` — list decisions for a project, optionally since-filtered.
- ``weekly_rollup`` — local-template activity summary over the trailing 7 days.

The substrate is local-first: SQLite-backed storage at
``~/.neurodock/cognitive-graph.sqlite`` by default, overridable via the
``NEURODOCK_GRAPH_DB_PATH`` environment variable. No network access; embeddings
and vector recall are deferred to v0.0.2.
"""

from neurodock_mcp_cognitive_graph.types import (
    Decision,
    EntityRecord,
    EntityRef,
    Fact,
    LiteralValue,
    RecallDecisionsResult,
    RecallEntityResult,
    RecordFactResult,
    WeeklyRollupResult,
)

# Backwards-compatible re-export name.
LiteralObject = LiteralValue

__version__ = "0.0.2"

__schema_version__ = 2
"""Storage schema version. Bumped every time a new SQL migration ships in
``src/neurodock_mcp_cognitive_graph/migrations/``. The migration applier
runs every ``NNNN_*.sql`` file in lexical order on each connection; existing
v0.0.1 databases will pick up migration ``0002_embeddings.sql`` in place."""

__all__ = [
    "Decision",
    "EntityRecord",
    "EntityRef",
    "Fact",
    "LiteralObject",
    "RecallDecisionsResult",
    "RecallEntityResult",
    "RecordFactResult",
    "WeeklyRollupResult",
    "__schema_version__",
    "__version__",
]
