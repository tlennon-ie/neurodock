"""Protocol conformance: boot the FastMCP server in-process, call each of the
three tools via the MCP protocol, and validate every response against the
JSON schema in ``packages/mcp-guardrail/schemas/``.

This is the architect-contract gate. The two stubbed detectors return a
structured ``DETECTOR_NOT_YET_IMPLEMENTED`` error; the active rumination
detector returns a payload that MUST validate against its schema.
"""

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
        # ADR 0006 §2: detected==true MUST carry non-empty override_options
        # and a non-empty similar_prompts array (schema-enforced).
        assert len(result.data["override_options"]) >= 1
        assert len(result.data["similar_prompts"]) >= 1


@pytest.mark.asyncio
async def test_check_hyperfocus_returns_detector_not_yet_implemented() -> None:
    server = build_server()
    async with Client(server) as client:
        # The FastMCP client raises on tool errors. We accept any exception
        # whose surface includes DETECTOR_NOT_YET_IMPLEMENTED.
        with pytest.raises(Exception) as exc_info:
            await client.call_tool(
                "check_hyperfocus",
                {
                    "chronometric_snapshot": {
                        "open_session": None,
                        "now": "2026-05-16T14:00:00+01:00",
                    }
                },
            )
        assert "DETECTOR_NOT_YET_IMPLEMENTED" in str(exc_info.value)


@pytest.mark.asyncio
async def test_check_sycophancy_returns_detector_not_yet_implemented() -> None:
    server = build_server()
    async with Client(server) as client:
        with pytest.raises(Exception) as exc_info:
            await client.call_tool(
                "check_sycophancy",
                {
                    "candidate_response": (
                        "Postgres gives you better concurrency but at the cost of operational "
                        "overhead; SQLite is the more honest choice for local-first."
                    ),
                    "decision_context": "database choice for neurodock substrate",
                },
            )
        assert "DETECTOR_NOT_YET_IMPLEMENTED" in str(exc_info.value)
