"""Protocol-conformance test.

Boots FastMCP in-process, exercises each of the four tools, and validates
each response against the corresponding JSON Schema using ``jsonschema``.
"""

from __future__ import annotations

import json
from datetime import UTC
from typing import Any

import pytest
from jsonschema import validate
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.server import build_app
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage


async def _call(app: Any, tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """Invoke a tool through FastMCP and return the parsed JSON payload."""
    result = await app.call_tool(tool, args)
    # FastMCP returns either a list of TextContent OR a (content, structured) tuple
    # depending on version. Handle both.
    if isinstance(result, tuple):
        content_list = result[0]
    else:
        content_list = result
    first = content_list[0]
    text = getattr(first, "text", None)
    if text is None:
        raise AssertionError(f"Unexpected tool result shape: {result!r}")
    parsed = json.loads(text)
    assert isinstance(parsed, dict)
    return parsed


def _output_schema(schemas: dict[str, dict[str, Any]], tool: str) -> dict[str, Any]:
    """Extract the output sub-schema and inline ``$defs`` for validation."""
    full = schemas[tool]
    output = full["properties"]["output"]
    if "$defs" in full:
        output = {**output, "$defs": full["$defs"]}
    return output


@pytest.mark.asyncio
async def test_lists_all_four_tools() -> None:
    storage = InMemoryStorage()
    clock = FixedClock.__new__(FixedClock)
    # Initialise the clock directly with a tz-aware instant for the test.
    from datetime import datetime

    clock._now = datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC)  # type: ignore[attr-defined]
    app = build_app(storage, clock)
    tools = await app.list_tools()
    names = {t.name for t in tools}
    assert names == {"recall_entity", "record_fact", "recall_decisions", "weekly_rollup"}


@pytest.mark.asyncio
async def test_record_fact_response_validates(
    schemas: dict[str, dict[str, Any]],
) -> None:
    from datetime import datetime

    clock = FixedClock(datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC))
    storage = InMemoryStorage()
    app = build_app(storage, clock)
    payload = await _call(
        app,
        "record_fact",
        {
            "subject": {"type": "person", "name": "Roberto"},
            "predicate": "decided_in",
            "object": {"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
            "source": "msg://slack/C123/p1715683200000100",
            "confidence": 1.0,
        },
    )
    validate(instance=payload, schema=_output_schema(schemas, "record_fact"))


@pytest.mark.asyncio
async def test_recall_entity_response_validates(
    schemas: dict[str, dict[str, Any]],
) -> None:
    from datetime import datetime

    clock = FixedClock(datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC))
    storage = InMemoryStorage()
    app = build_app(storage, clock)
    # Seed a fact so the recall has content.
    await _call(
        app,
        "record_fact",
        {
            "subject": {"type": "project", "name": "kipi-system"},
            "predicate": "depends_on",
            "object": {"type": "concept", "name": "sqlite-vec"},
        },
    )
    payload = await _call(app, "recall_entity", {"name_or_alias": "kipi-system"})
    validate(instance=payload, schema=_output_schema(schemas, "recall_entity"))
    # Also the "no match" path.
    payload2 = await _call(app, "recall_entity", {"name_or_alias": "nope-not-here"})
    validate(instance=payload2, schema=_output_schema(schemas, "recall_entity"))


@pytest.mark.asyncio
async def test_recall_decisions_response_validates(
    schemas: dict[str, dict[str, Any]],
) -> None:
    from datetime import datetime

    clock = FixedClock(datetime(2026, 5, 14, 10, 0, tzinfo=UTC))
    storage = InMemoryStorage()
    app = build_app(storage, clock)
    await _call(
        app,
        "record_fact",
        {
            "subject": {"type": "project", "name": "neurodock"},
            "predicate": "decided_in",
            "object": {"type": "decision", "name": "Ship rumination detector first"},
        },
    )
    payload = await _call(app, "recall_decisions", {"project": "neurodock"})
    validate(instance=payload, schema=_output_schema(schemas, "recall_decisions"))


@pytest.mark.asyncio
async def test_weekly_rollup_response_validates(
    schemas: dict[str, dict[str, Any]],
) -> None:
    from datetime import datetime

    clock = FixedClock(datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC))
    storage = InMemoryStorage()
    app = build_app(storage, clock)
    payload = await _call(app, "weekly_rollup", {})
    validate(instance=payload, schema=_output_schema(schemas, "weekly_rollup"))


@pytest.mark.asyncio
async def test_record_fact_friendly_error_path_through_fastmcp() -> None:
    """Server layer must pass `hint` and `example` through to the MCP caller.

    Reproduces the 2026-05-22 friction: a caller sends a bare string for
    `subject`. The response must include not just `error` and `message`, but
    a `hint` telling them what shape to use, and an `example` they can copy.
    """
    from datetime import datetime

    clock = FixedClock(datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC))
    storage = InMemoryStorage()
    app = build_app(storage, clock)
    payload = await _call(
        app,
        "record_fact",
        {
            "subject": "Roberto",  # bare string, wrong shape
            "predicate": "reports_to",
            "object": {"type": "person", "name": "Priya"},
        },
    )
    assert payload["error"] == "SUBJECT_REQUIRED"
    assert "hint" in payload
    assert "type" in payload["hint"] and "name" in payload["hint"]
    assert "example" in payload
    assert payload["example"]["subject"]["type"] == "person"


@pytest.mark.asyncio
async def test_record_fact_internal_error_does_not_blame_caller() -> None:
    """An unexpected storage exception must surface as INTERNAL_ERROR.

    Critical UX property: the wrapper distinguishes "user sent bad input"
    (`SUBJECT_REQUIRED` etc.) from "the server itself fell over"
    (`INTERNAL_ERROR`). Otherwise users retry-loop on input they got right.
    """
    from datetime import datetime
    from unittest.mock import patch

    clock = FixedClock(datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC))
    storage = InMemoryStorage()
    app = build_app(storage, clock)

    # Patch the underlying tool to raise a bare RuntimeError — simulates an
    # unexpected internal failure (disk corruption, programmer error, ...).
    with patch(
        "neurodock_mcp_cognitive_graph.server.record_fact_tool",
        side_effect=RuntimeError("simulated disk corruption"),
    ):
        payload = await _call(
            app,
            "record_fact",
            {
                "subject": {"type": "person", "name": "Roberto"},
                "predicate": "reports_to",
                "object": {"type": "person", "name": "Priya"},
            },
        )
    assert payload["error"] == "INTERNAL_ERROR"
    # The message must not pretend the caller sent bad input.
    assert "user input" not in payload["message"] or "not user input" in payload["message"]
    assert "simulated disk corruption" in payload["message"]


@pytest.mark.asyncio
async def test_sqlite_backed_end_to_end(
    schemas: dict[str, dict[str, Any]],
    tmp_path: Any,
) -> None:
    """End-to-end: SQLite backing, record_fact then recall_entity."""
    from datetime import datetime

    from neurodock_mcp_cognitive_graph.storage.sqlite import SQLiteStorage

    db_path = tmp_path / "e2e.sqlite"
    storage = SQLiteStorage(db_path)
    storage.initialise()
    try:
        clock = FixedClock(datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC))
        app = build_app(storage, clock)
        await _call(
            app,
            "record_fact",
            {
                "subject": {"type": "person", "name": "Roberto"},
                "predicate": "decided_in",
                "object": {"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
                "source": "msg://slack/C123/p1715683200000100",
            },
        )
        payload = await _call(app, "recall_entity", {"name_or_alias": "Roberto"})
        validate(instance=payload, schema=_output_schema(schemas, "recall_entity"))
        assert payload["entity"]["name"] == "Roberto"
    finally:
        storage.close()
