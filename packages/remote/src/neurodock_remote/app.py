# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Combined remote MCP server (ADR 0008/0009 + ADR 0010 Phase D).

Composes the three STATELESS NeuroDock servers into a single Streamable HTTP
endpoint, and (ADR 0010 Phase D) adds the OPT-IN BYOS surface:

    translation        : translate_incoming, check_tone, rewrite_outgoing, brief_meeting
    guardrail          : check_rumination, check_hyperfocus, check_sycophancy
    task-fractionator  : decompose            (next_one is stdio/local only)
    storage-admin      : connect_byos_storage, disconnect_storage, storage_status
    cognitive-graph    : recall_entity, record_fact, recall_decisions, weekly_rollup

The stateless surface (:data:`STATELESS_TOOL_NAMES`) is ALWAYS present and
unchanged. The opt-in surface (:data:`OPT_IN_TOOL_NAMES`) is *visible* to every
client, but every cognitive-graph call routes through the per-user BYOS seam:

- an anonymous / no-token caller gets ``STORAGE_NOT_AVAILABLE`` and nothing is
  stored or read;
- a signed-in but not-connected caller gets ``STORAGE_NOT_CONNECTED``;
- a connected caller's data lives in THEIR OWN libSQL/Turso database — NeuroDock
  persists nothing beyond the connection pointer.

This privacy boundary is the point of the phase: anonymous and non-opted-in
sessions remain completely stateless. ``next_one``, chronometric session state,
and the profile stay stdio/local only and are deferred (a tracked follow-up).

Vendor-neutrality (ADR 0005) is preserved: composed tools return deterministic
baselines plus structured LLM-refinement prompts; no LLM SDK runs in the server.
Embeddings are disabled on the hosted path (``NEURODOCK_GRAPH_DISABLE_EMBEDDINGS``)
so the image stays lean.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

from fastmcp import FastMCP
from neurodock_mcp_guardrail.server import build_server as build_guardrail_server
from neurodock_mcp_task_fractionator.server import (
    build_server as build_task_fractionator_server,
)
from neurodock_mcp_translation.server import build_server as build_translation_server
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from neurodock_remote.auth import build_auth_provider
from neurodock_remote.prompts import register_prompts
from neurodock_remote.state import ByosState, build_connection_store
from neurodock_remote.tools.graph import register_graph_tools
from neurodock_remote.tools.storage_admin import register_storage_admin_tools
from neurodock_remote.transport import resolve_bind

SERVER_NAME = "neurodock-remote"
SERVER_VERSION = "0.1.0"
MCP_PATH = "/mcp"

# The stateless tool surface (ADR 0008/0009). ALWAYS present and unchanged; any
# drift — a new tool slipping in, or a stateful tool leaking out — fails CI.
STATELESS_TOOL_NAMES = frozenset(
    {
        # translation (fully stateless)
        "translate_incoming",
        "check_tone",
        "rewrite_outgoing",
        "brief_meeting",
        # guardrail (heuristic, stateless)
        "check_rumination",
        "check_hyperfocus",
        "check_sycophancy",
        # task-fractionator (HTTP build: decompose only)
        "decompose",
    }
)

# The opt-in BYOS surface (ADR 0010 Phase D). These tools are visible to every
# client, but storing/reading anything requires a signed-in account + connected
# storage; the privacy boundary is enforced in the store-provider seam.
OPT_IN_TOOL_NAMES = frozenset(
    {
        # storage-admin (hosted-only)
        "connect_byos_storage",
        "disconnect_storage",
        "storage_status",
        # cognitive-graph (routed to the caller's own BYOS database)
        "recall_entity",
        "record_fact",
        "recall_decisions",
        "weekly_rollup",
    }
)

# The full advertised surface. Pinned by tests against the live listing.
REMOTE_TOOL_NAMES = STATELESS_TOOL_NAMES | OPT_IN_TOOL_NAMES

_INSTRUCTIONS = (
    "NeuroDock remote tools. The stateless surface — translation decodes incoming "
    "messages and shapes outgoing ones; guardrail flags rumination, hyperfocus, and "
    "over-validation; decompose breaks a vague goal into atomic tasks — needs no "
    "account. The opt-in memory surface (recall_entity, record_fact, "
    "recall_decisions, weekly_rollup) requires a signed-in account that has "
    "connected its OWN database via connect_byos_storage: your graph data lives in "
    "your database, never on NeuroDock. Anonymous sessions are fully stateless. "
    "Session timing and the user profile are NOT available here — they live on the "
    "local install."
)

_LOG = logging.getLogger("neurodock_remote.app")


def build_combined_server(connections: Any | None = None) -> FastMCP[Any]:
    """Compose the stateless servers + opt-in BYOS surface into one MCP server.

    ``mount`` (no namespace) keeps the original flat tool names, so the combined
    endpoint presents the same tool names the local servers do.

    ``connections`` is the per-user BYOS connection store
    (:class:`~neurodock_state.byos_connection_store.ByosConnectionStore`). Tests
    inject an in-memory store; in production it is built from the environment
    (Clerk-metadata-backed). When ``None`` and no secrets are configured, the
    opt-in tools are still registered but every storage operation returns the
    structured "sign in / connect storage" refusal — nothing is ever stored.
    """
    combined: FastMCP[Any] = FastMCP(
        name=SERVER_NAME,
        version=SERVER_VERSION,
        instructions=_INSTRUCTIONS,
        auth=build_auth_provider(os.environ),
    )

    combined.mount(build_translation_server())
    combined.mount(build_guardrail_server())
    # http_mode=True registers ONLY `decompose`; `next_one` (reads the local
    # cognitive graph) is omitted entirely.
    combined.mount(build_task_fractionator_server(http_mode=True))

    # Skill-style MCP prompts (ADR 0010, Phase A) — stateless entry points that
    # guide the model to the matching hosted tool. No personal data.
    register_prompts(combined)

    # Opt-in BYOS surface (ADR 0010 Phase D). The connection store may be missing
    # (no secrets configured); the ByosState still answers every call with the
    # structured refusal, so the privacy boundary holds with or without a backing.
    resolved_connections = (
        connections if connections is not None else build_connection_store(os.environ)
    )
    if resolved_connections is None:
        from neurodock_state.byos_connection_store import InMemoryByosConnectionStore

        # An ephemeral, never-persisted store. Without auth configured no caller
        # can ever populate it (require_user() refuses anonymous callers first),
        # so this stays empty in practice; it exists only so the tools register.
        resolved_connections = InMemoryByosConnectionStore()
        _LOG.warning(
            "byos_storage_unbacked: no NEURODOCK_CLERK_SECRET_KEY/"
            "NEURODOCK_STATE_MASTER_KEY — opt-in tools are visible but cannot "
            "persist; every call returns the sign-in/connect refusal (ADR 0010 §4)"
        )
    state = ByosState(resolved_connections)
    register_storage_admin_tools(combined, state)
    register_graph_tools(combined, state)

    @combined.custom_route("/health", methods=["GET"])
    async def health_check(request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "service": SERVER_NAME, "version": SERVER_VERSION})

    return combined


def create_app() -> Starlette:
    """ASGI application factory for uvicorn.

    Deploy with::

        uvicorn neurodock_remote.app:create_app --factory --host 0.0.0.0 --port 8000

    Serves the MCP endpoint at ``/mcp``, a ``/health`` probe, and (when auth is
    configured) the RFC 9728 protected-resource metadata.
    """
    return build_combined_server().http_app(path=MCP_PATH)


def main() -> None:
    """Console-script entrypoint for a local run (``neurodock-remote``).

    Binds per :func:`neurodock_remote.transport.resolve_bind` (localhost by
    default). The container image sets ``NEURODOCK_HTTP_HOST=0.0.0.0`` to bind all
    interfaces behind the edge proxy.
    """
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format='{"logger":"%(name)s","level":"%(levelname)s","msg":"%(message)s"}',
    )
    host, port = resolve_bind(os.environ)

    import uvicorn

    _LOG.info(
        "serving_combined_remote_mcp",
        extra={"host": host, "port": port, "path": MCP_PATH},
    )
    uvicorn.run(create_app(), host=host, port=port)


if __name__ == "__main__":  # pragma: no cover — exercised via console script
    main()
