# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Combined remote MCP server (ADR 0008/0009, Phase 2).

Composes the three STATELESS NeuroDock servers into a single Streamable HTTP
endpoint that exposes ONLY the remote-safe tool surface:

    translation        : translate_incoming, check_tone, rewrite_outgoing, brief_meeting
    guardrail          : check_rumination, check_hyperfocus, check_sycophancy
    task-fractionator  : decompose            (next_one is stdio/local only)

The cognitive graph, chronometric session state, the profile, and
task-fractionator ``next_one`` are NEVER mounted here — they read or hold local
state and must stay on stdio. The boundary is enforced in code (each sub-server is
built in its remote-safe configuration) and pinned by tests against
:data:`REMOTE_TOOL_NAMES`.

Vendor-neutrality (ADR 0005) is preserved: the composed tools still return
deterministic baselines plus structured LLM-refinement prompts; no LLM SDK runs in
the server.
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
from neurodock_remote.transport import resolve_bind

SERVER_NAME = "neurodock-remote"
SERVER_VERSION = "0.1.0"
MCP_PATH = "/mcp"

# The remote-safe tool surface (ADR 0008/0009). Pinned by tests: any drift — a new
# tool slipping in, or a stateful tool leaking out — fails CI.
REMOTE_TOOL_NAMES = frozenset(
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

_INSTRUCTIONS = (
    "NeuroDock remote tools: the stateless communication and planning surface. "
    "Translation decodes incoming messages and shapes outgoing ones; guardrail "
    "flags rumination, hyperfocus, and over-validation; decompose breaks a vague "
    "goal into atomic tasks. Personal memory, session timing, and the user profile "
    "are intentionally NOT available here — they live on the local install."
)

_LOG = logging.getLogger("neurodock_remote.app")


def build_combined_server() -> FastMCP[Any]:
    """Compose the three stateless servers into one remote MCP surface.

    ``mount`` (no namespace) keeps the original flat tool names, so the combined
    endpoint presents the same tool names the local servers do.
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
