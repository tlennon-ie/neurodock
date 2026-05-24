"""FastMCP server wiring for the cognitive graph.

This module wires the four tool implementations to FastMCP, exposes the
``app`` global (used by the smoke test) and provides a CLI entrypoint.
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

from mcp.server.fastmcp import FastMCP

from neurodock_mcp_cognitive_graph import __version__
from neurodock_mcp_cognitive_graph.clock import Clock, SystemClock
from neurodock_mcp_cognitive_graph.config import resolve_db_path
from neurodock_mcp_cognitive_graph.errors import InternalToolError, ToolError
from neurodock_mcp_cognitive_graph.storage.base import Storage
from neurodock_mcp_cognitive_graph.storage.sqlite import SQLiteStorage
from neurodock_mcp_cognitive_graph.tools import (
    recall_decisions as recall_decisions_tool,
)
from neurodock_mcp_cognitive_graph.tools import (
    recall_entity as recall_entity_tool,
)
from neurodock_mcp_cognitive_graph.tools import (
    record_fact as record_fact_tool,
)
from neurodock_mcp_cognitive_graph.tools import (
    weekly_rollup as weekly_rollup_tool,
)

logger = logging.getLogger("neurodock_mcp_cognitive_graph")


def _serialise(model: Any) -> dict[str, Any]:
    """Pydantic v2 model → JSON-safe dict (datetimes/dates → ISO strings)."""
    parsed: dict[str, Any] = json.loads(model.model_dump_json())
    return parsed


def build_app(
    storage: Storage,
    clock: Clock | None = None,
    name: str = "neurodock-mcp-cognitive-graph",
) -> FastMCP:
    """Construct a FastMCP server bound to the given storage/clock."""
    active_clock = clock or SystemClock()
    app = FastMCP(name)

    @app.tool(
        name="recall_entity",
        description=(
            "Look up everything the cognitive graph knows about a named person, "
            "project, decision, or concept. Alias-resolves the input."
        ),
    )
    def recall_entity(name_or_alias: str) -> dict[str, Any]:
        try:
            result = recall_entity_tool(storage, name_or_alias)
        except ToolError as exc:
            logger.warning("recall_entity error code=%s", exc.code)
            return exc.to_payload()
        return _serialise(result)

    @app.tool(
        name="record_fact",
        description=(
            "Persist a typed-edge (subject, predicate, object) fact into the local "
            "cognitive graph. Entities referenced by name are auto-created."
        ),
    )
    def record_fact(
        subject: Any,
        predicate: Any,
        object: Any,
        source: str | None = None,
        confidence: float | None = None,
    ) -> dict[str, Any]:
        # `subject`, `predicate`, and `object` are intentionally typed as Any
        # so wrong-shape input (a bare string, a list, missing keys) is caught
        # by the tool's own friendly-error path rather than by FastMCP's
        # generic Pydantic validator. The trade-off: callers no longer get a
        # type schema from FastMCP itself for these args — but in exchange
        # they get one-shot, actionable error messages. See record_fact UX
        # friction note (MEMORY.md, 2026-05-22).
        try:
            result = record_fact_tool(
                storage,
                active_clock,
                subject=subject,
                predicate=predicate,
                object=object,
                source=source,
                confidence=confidence,
            )
        except ToolError as exc:
            logger.warning("record_fact error code=%s", exc.code)
            return exc.to_payload()
        except Exception as exc:
            logger.exception("record_fact unexpected internal error")
            return InternalToolError(str(exc)).to_payload()
        return _serialise(result)

    @app.tool(
        name="recall_decisions",
        description=(
            "Return decisions recorded against a named project, ordered by date "
            "descending, optionally filtered by an ISO 8601 since-date."
        ),
    )
    def recall_decisions(project: str, since: str | None = None) -> dict[str, Any]:
        try:
            result = recall_decisions_tool(storage, project, since)
        except ToolError as exc:
            logger.warning("recall_decisions error code=%s", exc.code)
            return exc.to_payload()
        return _serialise(result)

    @app.tool(
        name="weekly_rollup",
        description=(
            "Return a server-generated activity summary for the trailing seven "
            "local days, optionally scoped to a project. Summary text is rendered "
            "by local templating; no LLM call is made from inside this server."
        ),
    )
    def weekly_rollup(project: str | None = None) -> dict[str, Any]:
        try:
            result = weekly_rollup_tool(storage, active_clock, project)
        except ToolError as exc:
            logger.warning("weekly_rollup error code=%s", exc.code)
            return exc.to_payload()
        return _serialise(result)

    return app


def _build_default_storage() -> SQLiteStorage:
    storage = SQLiteStorage(resolve_db_path())
    storage.initialise()
    return storage


# Module-level app for `from neurodock_mcp_cognitive_graph import server; server.app`.
# Construction is deferred to a builder so tests can substitute storage.
app: FastMCP = FastMCP("neurodock-mcp-cognitive-graph")
"""Placeholder app to support the smoke test ``server.app.name``. Real apps
are constructed via :func:`build_app` in main()."""


def main() -> None:
    """CLI entrypoint. Boots the SQLite-backed server on stdio."""
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format='{"ts":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
    )
    logger.info("starting neurodock-mcp-cognitive-graph v%s", __version__)
    storage = _build_default_storage()
    try:
        real_app = build_app(storage)
        real_app.run()
    finally:
        storage.close()


if __name__ == "__main__":  # pragma: no cover
    main()
