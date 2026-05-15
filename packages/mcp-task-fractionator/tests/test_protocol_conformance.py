"""Protocol conformance: boot the FastMCP server in-process, exercise both
tools via the MCP protocol, and validate every response against the JSON
schema in ``packages/mcp-task-fractionator/schemas/``.

If a tool drifts from its schema, this test must fail.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastmcp import Client
from jsonschema import Draft202012Validator
from neurodock_mcp_task_fractionator.server import build_server
from neurodock_mcp_task_fractionator.sources import InMemoryPendingTaskSource
from neurodock_mcp_task_fractionator.types import Task

SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"


def _load_schema(filename: str) -> dict[str, Any]:
    raw = (SCHEMAS_DIR / filename).read_text(encoding="utf-8")
    return json.loads(raw)


def _output_validator(schema: dict[str, Any]) -> Draft202012Validator:
    output_schema = schema["properties"]["output"]
    return Draft202012Validator(output_schema)


@pytest.mark.asyncio
async def test_both_tools_conform_to_their_schemas() -> None:
    """Integration: invoke each tool over MCP, validate responses."""

    source = InMemoryPendingTaskSource()
    server = build_server(source=source)

    async with Client(server) as client:
        # 1) decompose — recognised verb + noun returns a well-formed payload.
        result = await client.call_tool(
            "decompose",
            {"goal": "ship the founding-scope RFC by Friday", "time_budget": "PT4H"},
        )
        _output_validator(_load_schema("decompose.schema.json")).validate(result.data)

        # 2) next_one — seed the in-memory source first.
        seeded_task = Task(
            id="c1e4d2a8-7b3f-4f9a-9c1e-2d3a4b5c6d7e",
            title="Draft the manifesto five-principles section",
            description=("Write the five-principles block of MANIFESTO.md in the repo root."),
            estimated_minutes=45,
            acceptance_criteria=[
                "MANIFESTO.md exists at repo root",
                "All five principles are present",
            ],
            dependencies=[],
            sequence=1,
            tags=["writing", "governance"],
        )
        source.add("founding-scope-rfc", [seeded_task])

        result = await client.call_tool("next_one", {"project": "founding-scope-rfc"})
        _output_validator(_load_schema("next_one.schema.json")).validate(result.data)


@pytest.mark.asyncio
async def test_both_tools_are_registered() -> None:
    """Sanity: the server exposes exactly the two tools, by name."""

    server = build_server(source=InMemoryPendingTaskSource())
    async with Client(server) as client:
        tools = await client.list_tools()
        names = {tool.name for tool in tools}
        assert names == {"decompose", "next_one"}
