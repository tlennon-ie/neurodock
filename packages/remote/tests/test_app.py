# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Combined remote server tests (ADR 0008/0009).

Pins the remote tool surface to exactly the eight remote-safe tools and asserts the
local-only tools (next_one, cognitive-graph, chronometric) are never exposed.

Synchronous (``asyncio.run``) rather than ``async def`` so they do not depend on
pytest-asyncio auto-mode — the repo-root pytest run does not apply the per-package
``asyncio_mode = "auto"``.
"""

from __future__ import annotations

import asyncio

from neurodock_remote.app import (
    REMOTE_TOOL_NAMES,
    build_combined_server,
    create_app,
)
from starlette.applications import Starlette

_LOCAL_ONLY_TOOLS = frozenset(
    {
        # task-fractionator (stdio only)
        "next_one",
        # cognitive-graph
        "recall_entity",
        "record_fact",
        "recall_decisions",
        "weekly_rollup",
        # chronometric
        "get_time_context",
        "mark_session_start",
        "mark_session_end",
        "request_break_if_needed",
        "idle_status",
    }
)


def _combined_tool_names() -> set[str]:
    server = build_combined_server()
    return {tool.name for tool in asyncio.run(server.list_tools())}


def test_combined_exposes_exactly_the_remote_safe_tools() -> None:
    assert _combined_tool_names() == set(REMOTE_TOOL_NAMES)


def test_remote_tool_names_constant_is_the_eight_stateless_tools() -> None:
    assert REMOTE_TOOL_NAMES == {
        "translate_incoming",
        "check_tone",
        "rewrite_outgoing",
        "brief_meeting",
        "check_rumination",
        "check_hyperfocus",
        "check_sycophancy",
        "decompose",
    }


def test_local_only_tools_are_never_exposed() -> None:
    names = _combined_tool_names()
    leaked = names & _LOCAL_ONLY_TOOLS
    assert leaked == set(), f"local-only tools leaked over the remote transport: {leaked}"


def test_create_app_returns_starlette_app_with_health_route() -> None:
    app = create_app()
    assert isinstance(app, Starlette)
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/health" in paths
