# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tool annotations: ``decompose`` is advertised as read-only.

The Anthropic Connectors Directory rejects tools that lack a ``title`` and a
``readOnlyHint``. ``decompose`` is the stateless, remote-safe tool (ADR
0008/0009): it returns tasks but does NOT persist them, so it carries
``readOnlyHint == True`` plus a human ``title``.

``next_one`` reads the local cognitive graph and is local-only; it is left
unannotated for now and is not part of the directory submission.

Synchronous (``asyncio.run``) rather than ``async def`` so they do not depend on
pytest-asyncio auto-mode — the repo-root pytest run does not apply the
per-package ``asyncio_mode = "auto"``.
"""

from __future__ import annotations

import asyncio

from neurodock_mcp_task_fractionator.server import build_server
from neurodock_mcp_task_fractionator.sources import InMemoryPendingTaskSource


def _tools_by_name() -> dict[str, object]:
    server = build_server(source=InMemoryPendingTaskSource())
    return {tool.name: tool for tool in asyncio.run(server.list_tools())}


def test_decompose_is_marked_read_only_with_a_title() -> None:
    tools = _tools_by_name()
    annotations = tools["decompose"].annotations
    assert annotations is not None, "decompose is missing annotations"
    assert annotations.readOnlyHint is True
    assert annotations.title == "Decompose goal into tasks"


def test_next_one_is_left_unannotated_for_now() -> None:
    tools = _tools_by_name()
    annotations = tools["next_one"].annotations
    # next_one is local-only and not part of the directory submission, so it
    # must NOT yet be marked read-only.
    assert annotations is None or annotations.readOnlyHint is not True
