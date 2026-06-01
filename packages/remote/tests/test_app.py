# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Combined remote server tests (ADR 0008/0009 + ADR 0010 Phase D).

Pins TWO surfaces:

- :data:`STATELESS_TOOL_NAMES` — the eight remote-safe tools, ALWAYS present and
  unchanged (the ADR 0008/0009 boundary).
- :data:`OPT_IN_TOOL_NAMES` — the BYOS surface (storage-admin + the four
  cognitive-graph tools), visible in the listing.

The local-only tools (next_one, chronometric) are still never exposed.

Security: a separate test proves an anonymous (no-token) call to a graph tool
returns the structured not-available response and writes NOTHING to the
connection store. This is the privacy boundary the phase exists to protect.

Synchronous (``asyncio.run``) rather than ``async def`` so they do not depend on
pytest-asyncio auto-mode — the repo-root pytest run does not apply the per-package
``asyncio_mode = "auto"``.
"""

from __future__ import annotations

import asyncio

from fastmcp import Client
from neurodock_remote.app import (
    OPT_IN_TOOL_NAMES,
    REMOTE_TOOL_NAMES,
    STATELESS_TOOL_NAMES,
    build_combined_server,
    create_app,
)
from neurodock_state.byos_connection_store import InMemoryByosConnectionStore
from starlette.applications import Starlette

_LOCAL_ONLY_TOOLS = frozenset(
    {
        # task-fractionator (stdio only)
        "next_one",
        # chronometric (session timing — deferred, stdio only)
        "get_time_context",
        "mark_session_start",
        "mark_session_end",
        "request_break_if_needed",
        "idle_status",
    }
)


def _combined_tool_names(connections: InMemoryByosConnectionStore | None = None) -> set[str]:
    server = build_combined_server(connections or InMemoryByosConnectionStore())
    return {tool.name for tool in asyncio.run(server.list_tools())}


def test_combined_exposes_exactly_the_remote_tool_surface() -> None:
    assert _combined_tool_names() == set(REMOTE_TOOL_NAMES)


def test_stateless_tools_are_always_present_and_unchanged() -> None:
    # The ADR 0008/0009 boundary: these eight, exactly, unconditionally.
    assert STATELESS_TOOL_NAMES == {
        "translate_incoming",
        "check_tone",
        "rewrite_outgoing",
        "brief_meeting",
        "check_rumination",
        "check_hyperfocus",
        "check_sycophancy",
        "decompose",
    }
    assert STATELESS_TOOL_NAMES <= _combined_tool_names()


def test_opt_in_tools_are_present_in_the_listing() -> None:
    # The BYOS surface is visible (clients can discover it); access is gated at
    # call time, not by hiding the tools.
    assert OPT_IN_TOOL_NAMES == {
        "enable_hosted_storage",
        "connect_byos_storage",
        "disable_and_erase_storage",
        "disconnect_storage",
        "storage_status",
        "recall_entity",
        "record_fact",
        "recall_decisions",
        "weekly_rollup",
    }
    assert OPT_IN_TOOL_NAMES <= _combined_tool_names()


def test_remote_tool_names_is_the_union_of_the_two_surfaces() -> None:
    assert REMOTE_TOOL_NAMES == STATELESS_TOOL_NAMES | OPT_IN_TOOL_NAMES
    # The two surfaces are disjoint — no tool is both stateless and opt-in.
    assert STATELESS_TOOL_NAMES & OPT_IN_TOOL_NAMES == set()


def test_deferred_local_only_tools_are_never_exposed() -> None:
    names = _combined_tool_names()
    leaked = names & _LOCAL_ONLY_TOOLS
    assert leaked == set(), f"local-only tools leaked over the remote transport: {leaked}"


def test_anonymous_graph_call_is_refused_and_stores_nothing() -> None:
    # Arrange — no auth provider is configured in tests, so every caller is
    # anonymous. The connection store starts empty.
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)

    async def _call() -> dict[str, object]:
        async with Client(server) as client:
            result = await client.call_tool(
                "record_fact",
                {
                    "subject": {"type": "person", "name": "Mallory"},
                    "predicate": "tagged",
                    "object": {"literal": "should-not-persist"},
                },
            )
            return dict(result.data)

    # Act
    payload = asyncio.run(_call())

    # Assert — structured refusal, and NOTHING written to the connection store.
    assert payload["error"] == "STORAGE_NOT_AVAILABLE"
    assert len(connections) == 0


def test_anonymous_storage_status_reports_unauthenticated() -> None:
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)

    async def _call() -> dict[str, object]:
        async with Client(server) as client:
            result = await client.call_tool("storage_status", {})
            return dict(result.data)

    payload = asyncio.run(_call())
    assert payload == {"authenticated": False, "mode": "none", "connected": False}
    assert len(connections) == 0


def test_create_app_returns_starlette_app_with_health_route() -> None:
    app = create_app()
    assert isinstance(app, Starlette)
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/health" in paths
