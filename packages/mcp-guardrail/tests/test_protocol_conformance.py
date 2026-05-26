# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Protocol conformance tests for the live v0.0.2 server."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastmcp import Client
from jsonschema import Draft202012Validator
from neurodock_mcp_guardrail.server import build_server

SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"


def _load_schema(filename: str) -> dict[str, Any]:
    raw = (SCHEMAS_DIR / filename).read_text(encoding="utf-8")
    return json.loads(raw)


def _output_validator(schema: dict[str, Any]) -> Draft202012Validator:
    output_schema = schema["properties"]["output"]
    return Draft202012Validator(output_schema)


@pytest.mark.asyncio
async def test_all_three_tools_are_registered() -> None:
    server = build_server()
    async with Client(server) as client:
        tools = await client.list_tools()
        names = {tool.name for tool in tools}
        assert names == {"check_rumination", "check_hyperfocus", "check_sycophancy"}


@pytest.mark.asyncio
async def test_check_rumination_response_conforms_to_schema_not_detected() -> None:
    server = build_server()
    async with Client(server) as client:
        result = await client.call_tool(
            "check_rumination",
            {
                "current_prompt": "should I use Postgres or SQLite for this?",
                "history": [],
            },
        )
        _output_validator(_load_schema("check_rumination.schema.json")).validate(result.data)
        assert result.data["detected"] is False


@pytest.mark.asyncio
async def test_check_rumination_response_conforms_to_schema_when_detected() -> None:
    server = build_server()
    async with Client(server) as client:
        result = await client.call_tool(
            "check_rumination",
            {
                "current_prompt": "should I really use Postgres for this or is SQLite better?",
                "history": [
                    {
                        "text": "should I use Postgres or SQLite for this?",
                        "at": "2026-05-16T13:02:00+01:00",
                    },
                    {
                        "text": "is Postgres really the right choice over SQLite here?",
                        "at": "2026-05-16T13:34:00+01:00",
                    },
                    {
                        "text": "am I sure Postgres beats SQLite for this workload?",
                        "at": "2026-05-16T14:05:00+01:00",
                    },
                ],
                "window_minutes": 90,
                "threshold_count": 3,
                "similarity_threshold": 0.2,
            },
        )
        _output_validator(_load_schema("check_rumination.schema.json")).validate(result.data)
        assert result.data["detected"] is True
        assert len(result.data["override_options"]) >= 1


@pytest.mark.asyncio
async def test_check_hyperfocus_no_session_returns_level_none() -> None:
    server = build_server()
    async with Client(server) as client:
        result = await client.call_tool(
            "check_hyperfocus",
            {
                "chronometric_snapshot": {
                    "open_session": None,
                    "now": "2026-05-16T14:00:00+01:00",
                }
            },
        )
        _output_validator(_load_schema("check_hyperfocus.schema.json")).validate(result.data)
        assert result.data["level"] == "none"
        assert result.data["override_options"] == []


@pytest.mark.asyncio
async def test_check_hyperfocus_nudge_level_with_prior_intent_echoed() -> None:
    server = build_server()
    async with Client(server) as client:
        result = await client.call_tool(
            "check_hyperfocus",
            {
                "chronometric_snapshot": {
                    "open_session": {
                        "session_id": "550e8400-e29b-41d4-a716-446655440000",
                        "started_at": "2026-05-16T13:00:00+01:00",
                        "intent": "ship the v0.0.2 RFC and stop by 18:30",
                        "elapsed_seconds": 100 * 60,
                    },
                    "now": "2026-05-16T14:40:00+01:00",
                },
                "hyperfocus_break_minutes": 90,
            },
        )
        _output_validator(_load_schema("check_hyperfocus.schema.json")).validate(result.data)
        assert result.data["level"] == "nudge"
        assert result.data["prior_intent"] == "ship the v0.0.2 RFC and stop by 18:30"


@pytest.mark.asyncio
async def test_check_sycophancy_unconditional_agreement_response_validates() -> None:
    server = build_server()
    async with Client(server) as client:
        result = await client.call_tool(
            "check_sycophancy",
            {
                "candidate_response": "Yes, that is exactly the right call. Go ahead.",
                "decision_context": "database choice for neurodock substrate",
            },
        )
        _output_validator(_load_schema("check_sycophancy.schema.json")).validate(result.data)
        assert result.data["detected"] is True
        assert result.data["pattern"] == "unconditional_agreement"


@pytest.mark.asyncio
async def test_check_sycophancy_balanced_response_validates_as_not_detected() -> None:
    server = build_server()
    async with Client(server) as client:
        result = await client.call_tool(
            "check_sycophancy",
            {
                "candidate_response": (
                    "Postgres gives you better concurrency but at the cost of operational "
                    "overhead; SQLite is the more honest choice for local-first."
                ),
                "decision_context": "database choice for neurodock substrate",
            },
        )
        _output_validator(_load_schema("check_sycophancy.schema.json")).validate(result.data)
        assert result.data["detected"] is False
        assert result.data["pattern"] == "none"
