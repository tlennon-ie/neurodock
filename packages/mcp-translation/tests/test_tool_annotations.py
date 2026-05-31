# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tool annotations: every translation tool is advertised as read-only.

The Anthropic Connectors Directory rejects tools that lack a ``title`` and a
``readOnlyHint``. All four translation tools are advisory and have no side
effects, so each must carry ``readOnlyHint == True`` plus a human ``title``.

Synchronous (``asyncio.run``) rather than ``async def`` so they do not depend on
pytest-asyncio auto-mode — the repo-root pytest run does not apply the
per-package ``asyncio_mode = "auto"``.
"""

from __future__ import annotations

import asyncio

from neurodock_mcp_translation.server import build_server

_EXPECTED_TITLES = {
    "translate_incoming": "Translate incoming message",
    "check_tone": "Check tone",
    "rewrite_outgoing": "Rewrite outgoing",
    "brief_meeting": "Brief meeting",
}


def _tools_by_name() -> dict[str, object]:
    server = build_server()
    return {tool.name: tool for tool in asyncio.run(server.list_tools())}


def test_all_tools_are_marked_read_only() -> None:
    tools = _tools_by_name()
    assert set(tools) == set(_EXPECTED_TITLES)
    for name in _EXPECTED_TITLES:
        annotations = tools[name].annotations
        assert annotations is not None, f"{name} is missing annotations"
        assert annotations.readOnlyHint is True, f"{name} must be read-only"


def test_all_tools_carry_a_human_title() -> None:
    tools = _tools_by_name()
    for name, expected_title in _EXPECTED_TITLES.items():
        assert tools[name].annotations.title == expected_title
