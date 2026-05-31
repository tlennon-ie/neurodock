# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Un-gated cognitive-graph tools for the hosted server (ADR 0010 Phase D).

The four cognitive-graph tools (``recall_entity``, ``record_fact``,
``recall_decisions``, ``weekly_rollup``) are exposed on the hosted endpoint for
opted-in BYOS users. Each call routes to the **caller's own** libSQL database via
:meth:`ByosState.graph_store`; anonymous and non-opted-in callers get a
structured refusal and nothing is stored or read.

Why re-wire instead of mounting ``build_app``?
----------------------------------------------
``build_app`` (the ADR 0010 Phase B seam) returns a low-level
``mcp.server.fastmcp.FastMCP`` server, whereas the combined remote server is a
FastMCP 3.x ``fastmcp.FastMCP``. FastMCP 3.x's ``mount``/``import_server`` only
accept a 3.x server, and the proxy path runs tool handlers in a *separate*
session context — where ``user_key_from_context()`` cannot see the combined
server's validated access token. The privacy boundary depends on the
store-provider closure executing in the request context that holds the token, so
we register the tools directly on the combined server and feed them the SAME
store-provider seam ``build_app`` would. The provider — :meth:`ByosState.graph_store`
— is resolved per call, exactly as ADR 0010 Phase B specifies.

Error handling mirrors ``build_app``'s server layer (ToolError → payload,
unexpected → InternalToolError) and adds the storage-boundary refusals from
:mod:`neurodock_remote.state`, so callers never see a traceback.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, cast

from neurodock_mcp_cognitive_graph.clock import SystemClock
from neurodock_mcp_cognitive_graph.errors import InternalToolError, ToolError
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

from neurodock_remote.state import ByosState, StorageUnavailableError

if TYPE_CHECKING:  # pragma: no cover - typing only
    from fastmcp import FastMCP

_LOG = logging.getLogger("neurodock_remote.tools.graph")


def _serialise(model: Any) -> dict[str, Any]:
    """Pydantic v2 model → JSON-safe dict (mirrors the cognitive-graph server)."""
    parsed: dict[str, Any] = json.loads(model.model_dump_json())
    return parsed


def _payload(value: Any) -> dict[str, Any]:
    """Coerce an (untyped) cognitive-graph error payload to a typed dict.

    The cognitive-graph package ships without ``py.typed``, so its
    ``ToolError.to_payload()`` is seen as returning ``Any`` here. This keeps the
    tool functions' declared ``dict[str, Any]`` return honest under strict mypy.
    """
    return cast("dict[str, Any]", value)


def register_graph_tools(mcp: FastMCP[Any], state: ByosState) -> None:
    """Register the four BYOS-gated cognitive-graph tools on the combined server.

    ``state`` is the per-user storage seam: each tool resolves the caller's own
    store via ``state.graph_store()`` at call time. The first thing every tool
    does is resolve that store; a refusal (anonymous / not-connected) short-circuits
    BEFORE any tool logic runs, so nothing is stored or read for those callers.
    """
    clock = SystemClock()

    @mcp.tool(
        name="recall_entity",
        description=(
            "Look up everything your connected cognitive graph knows about a named "
            "person, project, decision, or concept. Alias-resolves the input. "
            "Requires a signed-in account with connected storage (connect_byos_storage)."
        ),
    )
    def recall_entity(name_or_alias: str) -> dict[str, Any]:
        try:
            storage = state.graph_store()
        except StorageUnavailableError as exc:
            return exc.to_payload()
        try:
            try:
                result = recall_entity_tool(storage, name_or_alias)
            except ToolError as exc:
                _LOG.warning("recall_entity error code=%s", exc.code)
                return _payload(exc.to_payload())
            return _serialise(result)
        finally:
            storage.close()

    @mcp.tool(
        name="record_fact",
        description=(
            "Persist a typed-edge (subject, predicate, object) fact into your "
            "connected cognitive graph. Entities referenced by name are auto-created. "
            "Requires a signed-in account with connected storage (connect_byos_storage)."
        ),
    )
    def record_fact(
        subject: Any,
        predicate: Any,
        object: Any,
        source: str | None = None,
        confidence: float | None = None,
    ) -> dict[str, Any]:
        # subject/predicate/object are intentionally Any (see the cognitive-graph
        # server's note) so wrong-shape input gets a friendly error, not a raw
        # Pydantic validation failure.
        try:
            storage = state.graph_store()
        except StorageUnavailableError as exc:
            return exc.to_payload()
        try:
            try:
                result = record_fact_tool(
                    storage,
                    clock,
                    subject=subject,
                    predicate=predicate,
                    object=object,
                    source=source,
                    confidence=confidence,
                )
            except ToolError as exc:
                _LOG.warning("record_fact error code=%s", exc.code)
                return _payload(exc.to_payload())
            except Exception as exc:  # mirror build_app's internal-error path
                _LOG.exception("record_fact unexpected internal error")
                return _payload(InternalToolError(str(exc)).to_payload())
            return _serialise(result)
        finally:
            storage.close()

    @mcp.tool(
        name="recall_decisions",
        description=(
            "Return decisions recorded against a named project in your connected "
            "cognitive graph, newest first, optionally filtered by an ISO 8601 "
            "since-date. Requires a signed-in account with connected storage."
        ),
    )
    def recall_decisions(project: str, since: str | None = None) -> dict[str, Any]:
        try:
            storage = state.graph_store()
        except StorageUnavailableError as exc:
            return exc.to_payload()
        try:
            try:
                result = recall_decisions_tool(storage, project, since)
            except ToolError as exc:
                _LOG.warning("recall_decisions error code=%s", exc.code)
                return _payload(exc.to_payload())
            return _serialise(result)
        finally:
            storage.close()

    @mcp.tool(
        name="weekly_rollup",
        description=(
            "Return a server-generated activity summary of your connected cognitive "
            "graph for the trailing seven local days, optionally scoped to a project. "
            "Requires a signed-in account with connected storage."
        ),
    )
    def weekly_rollup(project: str | None = None) -> dict[str, Any]:
        try:
            storage = state.graph_store()
        except StorageUnavailableError as exc:
            return exc.to_payload()
        try:
            try:
                result = weekly_rollup_tool(storage, clock, project)
            except ToolError as exc:
                _LOG.warning("weekly_rollup error code=%s", exc.code)
                return _payload(exc.to_payload())
            return _serialise(result)
        finally:
            storage.close()
