"""Protocol conformance: boot the FastMCP server in-process, call each of the
five tools via the MCP protocol, and validate every response against the JSON
schema in ``packages/mcp-chronometric/schemas/``.

This is the architect-contract gate. If a tool drifts from its schema, this
test must fail.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastmcp import Client
from jsonschema import Draft202012Validator
from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.profile import ChronometricProfile
from neurodock_mcp_chronometric.server import build_server
from neurodock_mcp_chronometric.state import SessionState

SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"


def _load_schema(filename: str) -> dict[str, Any]:
    raw = (SCHEMAS_DIR / filename).read_text(encoding="utf-8")
    return json.loads(raw)


def _output_validator(schema: dict[str, Any]) -> Draft202012Validator:
    output_schema = schema["properties"]["output"]
    return Draft202012Validator(output_schema)


@pytest.mark.asyncio
async def test_all_five_tools_conform_to_their_schemas() -> None:
    """Integration: invoke each tool over MCP and validate against its schema."""

    clock = FrozenClock(datetime(2026, 5, 15, 9, 0, 0, tzinfo=UTC))
    state = SessionState()
    # Force consent True so idle_status exercises the consented branch shape.
    profile = ChronometricProfile(os_idle_consent=True, raw_zones=None)
    server = build_server(state=state, clock=clock, profile=profile)

    async with Client(server) as client:
        # 1) get_time_context
        result = await client.call_tool("get_time_context", {})
        _output_validator(_load_schema("get_time_context.schema.json")).validate(result.data)

        # 2) mark_session_start
        result = await client.call_tool("mark_session_start", {"intent": "finish draft RFC reply"})
        _output_validator(_load_schema("mark_session_start.schema.json")).validate(result.data)

        # 3) request_break_if_needed — below threshold, expect null.
        result = await client.call_tool("request_break_if_needed", {"threshold_minutes": 90})
        # Output schema is a oneOf {null, object}; both branches are valid for
        # ``None``. We assert the null case here.
        assert result.data is None

        # Advance past threshold and re-check; expect a populated object.
        clock.advance(seconds=91 * 60)
        result = await client.call_tool("request_break_if_needed", {"threshold_minutes": 90})
        _output_validator(_load_schema("request_break_if_needed.schema.json")).validate(result.data)

        # 4) idle_status (consent granted via the injected profile)
        result = await client.call_tool("idle_status", {})
        _output_validator(_load_schema("idle_status.schema.json")).validate(result.data)

        # 5) mark_session_end
        result = await client.call_tool("mark_session_end", {"summary": "shipped the RFC reply"})
        _output_validator(_load_schema("mark_session_end.schema.json")).validate(result.data)


@pytest.mark.asyncio
async def test_all_five_tools_are_registered() -> None:
    """Sanity: the server exposes exactly the five tools, by name."""

    server = build_server()
    async with Client(server) as client:
        tools = await client.list_tools()
        names = {tool.name for tool in tools}
        assert names == {
            "get_time_context",
            "mark_session_start",
            "mark_session_end",
            "request_break_if_needed",
            "idle_status",
        }
