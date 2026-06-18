# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
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
async def test_empty_profile_reproduces_pre_r5_wire_shape() -> None:
    """Backward-compat over MCP: a neutral profile (no R5 fields) emits exactly
    the pre-R5 keys — none of the additive fields leak into the payload."""

    clock = FrozenClock(datetime(2026, 5, 15, 9, 0, 0, tzinfo=UTC))
    state = SessionState()
    # A bare profile with consent on but none of the R5 fields set.
    profile = ChronometricProfile(os_idle_consent=True, raw_zones=None)
    server = build_server(state=state, clock=clock, profile=profile)

    async with Client(server) as client:
        result = await client.call_tool("get_time_context", {})
        assert set(result.data.keys()) == {
            "now",
            "day_of_week",
            "time_since_last_prompt",
            "current_session_length",
            "energy_zone",
        }

        await client.call_tool("mark_session_start", {"intent": "finish draft RFC reply"})
        clock.advance(seconds=91 * 60)
        result = await client.call_tool("request_break_if_needed", {"threshold_minutes": 90})
        assert set(result.data.keys()) == {
            "elapsed",
            "prior_intent",
            "suggested_action",
            "threshold_minutes",
        }

        result = await client.call_tool("idle_status", {})
        assert "motor_fatigue_aware" not in result.data


@pytest.mark.asyncio
async def test_r5_populated_outputs_conform_to_their_schemas() -> None:
    """Integration: with R5 profile fields set, the populated additive output of
    get_time_context and request_break_if_needed still validates against the
    schemas over the MCP protocol (the hard_surface + end-of-day paths)."""

    from neurodock_mcp_chronometric.profile import ProtectedWindow, WeekdayOverride

    # 2026-05-15 12:05 (Friday) sits inside the 12:00-13:00 protected window and
    # is past the 11:00 weekday end-of-day override. Anchored in the SYSTEM-LOCAL
    # zone (the tools normalise via .astimezone()) so the window/cutoff
    # assertions are stable regardless of the test machine's timezone.
    clock = FrozenClock(datetime(2026, 5, 15, 12, 5, 0).astimezone())
    state = SessionState()
    profile = ChronometricProfile(
        os_idle_consent=True,
        raw_zones=None,
        hyperfocus_break_minutes=90,
        end_of_day_local="18:30",
        weekday_overrides={"friday": WeekdayOverride(end_of_day_local="11:00")},
        protected_windows=(ProtectedWindow(start="12:00", end="13:00", label="lunch"),),
        calendar_phase="marking",
        deadline_cluster_awareness=True,
        motor_fatigue_aware=True,
    )
    server = build_server(state=state, clock=clock, profile=profile)

    async with Client(server) as client:
        # get_time_context carries the populated R5 fields.
        result = await client.call_tool("get_time_context", {})
        _output_validator(_load_schema("get_time_context.schema.json")).validate(result.data)
        # Guard the frozen-date assumption: the 11:00 end-of-day below is the
        # FRIDAY weekday override, so a future date drift can't silently assert
        # the wrong override value.
        assert result.data["day_of_week"] == "Friday"
        assert result.data["effective_end_of_day_local"] == "11:00"
        assert result.data["past_end_of_day"] is True
        assert result.data["calendar_phase"] == "marking"
        assert result.data["deadline_cluster_awareness"] is True
        assert result.data["motor_fatigue_aware"] is True

        # Open a session and request a break while inside the protected window.
        await client.call_tool("mark_session_start", {"intent": "finish draft RFC reply"})
        result = await client.call_tool("request_break_if_needed", {"threshold_minutes": 90})
        _output_validator(_load_schema("request_break_if_needed.schema.json")).validate(result.data)
        assert result.data["escalation"] == "hard_surface"
        assert result.data["protected_window_label"] == "lunch"

        # idle_status surfaces the motor_fatigue_aware flag.
        result = await client.call_tool("idle_status", {})
        _output_validator(_load_schema("idle_status.schema.json")).validate(result.data)
        assert result.data["motor_fatigue_aware"] is True


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
