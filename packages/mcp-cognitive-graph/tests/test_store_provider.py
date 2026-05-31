# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``build_app`` store-provider seam (ADR 0010 Phase B).

``build_app`` accepts either a bound ``Storage`` (back-compat) or a
``Callable[[], Storage]`` store provider that is resolved on *every* tool call.
These tests pin both behaviours.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.server import build_app
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage

NOW = datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC)


async def _call(app: Any, tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """Invoke a tool through FastMCP and return the parsed JSON payload."""
    result = await app.call_tool(tool, args)
    content_list = result[0] if isinstance(result, tuple) else result
    first = content_list[0]
    text = getattr(first, "text", None)
    if text is None:
        raise AssertionError(f"Unexpected tool result shape: {result!r}")
    parsed = json.loads(text)
    assert isinstance(parsed, dict)
    return parsed


@pytest.mark.asyncio
async def test_store_provider_is_resolved_on_every_call() -> None:
    """The provider is invoked per tool call, so swapping the returned store
    between calls routes each call to a different backing."""
    # Arrange: two independent stores; a provider that returns whichever is
    # currently "active". This models a per-user resolver picking a backing.
    store_a = InMemoryStorage()
    store_b = InMemoryStorage()
    active = {"store": store_a}
    clock = FixedClock(NOW)
    app = build_app(lambda: active["store"], clock)

    # Act 1: record a fact while store_a is active.
    await _call(
        app,
        "record_fact",
        {
            "subject": {"type": "person", "name": "Ada"},
            "predicate": "depends_on",
            "object": {"type": "concept", "name": "analysis"},
        },
    )

    # Assert: store_a has the entity, store_b is empty.
    payload_a = await _call(app, "recall_entity", {"name_or_alias": "Ada"})
    assert payload_a["entity"] is not None
    assert payload_a["entity"]["name"] == "Ada"

    # Act 2: flip the active store, then recall through the SAME app.
    active["store"] = store_b
    payload_b = await _call(app, "recall_entity", {"name_or_alias": "Ada"})

    # Assert: store_b never saw Ada — proving per-call resolution.
    assert payload_b["entity"] is None


@pytest.mark.asyncio
async def test_provider_called_once_per_tool_invocation() -> None:
    # Arrange
    store = InMemoryStorage()
    calls = {"n": 0}

    def provider() -> InMemoryStorage:
        calls["n"] += 1
        return store

    app = build_app(provider, FixedClock(NOW))

    # Act
    await _call(app, "recall_entity", {"name_or_alias": "nobody"})
    await _call(app, "weekly_rollup", {})

    # Assert: build_app itself must not resolve the store; only tool calls do.
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_bare_storage_instance_still_supported() -> None:
    """Back-compat: passing a ``Storage`` instance behaves as before."""
    # Arrange
    store = InMemoryStorage()
    app = build_app(store, FixedClock(NOW))

    # Act
    await _call(
        app,
        "record_fact",
        {
            "subject": {"type": "person", "name": "Grace"},
            "predicate": "depends_on",
            "object": {"type": "concept", "name": "compilers"},
        },
    )
    payload = await _call(app, "recall_entity", {"name_or_alias": "Grace"})

    # Assert: the one bound store is used across calls.
    assert payload["entity"]["name"] == "Grace"
