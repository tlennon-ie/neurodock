# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Protocol-conformance: boot FastMCP in-process, invoke each of the four
tools over MCP, and validate each ``deterministic_analysis`` against the
v0.1.0 ``output`` sub-schema using ``jsonschema``.

The v0.0.1 envelope shape is::

    {
      "deterministic_analysis": <v0.1.0 output shape>,
      "prompt_for_llm_refinement": {"role": "user", "content": "...", "output_schema_ref": "..."},
      "eval_corpus_slice": "..."
    }

Per ADR 0005 §1 the server itself imports no LLM SDK — this test runs entirely
locally without any LLM call.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastmcp import Client
from jsonschema import Draft202012Validator
from neurodock_mcp_translation.server import build_server


def _output_validator(schema: dict[str, Any]) -> Draft202012Validator:
    output_schema = dict(schema["properties"]["output"])
    if "$defs" in schema:
        output_schema = {**output_schema, "$defs": schema["$defs"]}
    return Draft202012Validator(output_schema)


@pytest.mark.asyncio
async def test_all_four_tools_are_registered() -> None:
    """Sanity: the server exposes exactly the four expected tools."""

    server = build_server()
    async with Client(server) as client:
        tools = await client.list_tools()
        names = {tool.name for tool in tools}
        assert names == {
            "translate_incoming",
            "check_tone",
            "rewrite_outgoing",
            "brief_meeting",
        }


@pytest.mark.asyncio
async def test_all_four_tools_conform_to_their_schemas(
    schemas: dict[str, dict[str, Any]],
    sample_meeting_transcript: str,
    sample_slack_message: str,
    sample_pr_comment: str,
    sample_warm_baseline: list[str],
) -> None:
    """Integration: every tool's deterministic_analysis validates against its schema."""

    server = build_server()
    async with Client(server) as client:
        # 1) translate_incoming
        result = await client.call_tool(
            "translate_incoming",
            {"text": sample_slack_message, "channel": "slack"},
        )
        envelope = result.data
        assert "deterministic_analysis" in envelope
        assert "prompt_for_llm_refinement" in envelope
        assert "eval_corpus_slice" in envelope
        _output_validator(schemas["translate_incoming"]).validate(
            envelope["deterministic_analysis"]
        )

        # 2) check_tone
        result = await client.call_tool(
            "check_tone",
            {
                "text": sample_pr_comment,
                "baseline_messages": sample_warm_baseline,
                "target_register": "direct",
                "channel": "github",
            },
        )
        envelope = result.data
        _output_validator(schemas["check_tone"]).validate(envelope["deterministic_analysis"])

        # 3) rewrite_outgoing
        result = await client.call_tool(
            "rewrite_outgoing",
            {
                "text": sample_pr_comment,
                "target_register": "direct",
                "preserve_terms": ["section 3"],
                "channel": "github",
            },
        )
        envelope = result.data
        _output_validator(schemas["rewrite_outgoing"]).validate(envelope["deterministic_analysis"])

        # 4) brief_meeting
        result = await client.call_tool(
            "brief_meeting",
            {
                "transcript": sample_meeting_transcript,
                "me": "Thomas",
                "project": "neurodock",
                "speakers": ["Priya", "Thomas", "Roberto"],
            },
        )
        envelope = result.data
        _output_validator(schemas["brief_meeting"]).validate(envelope["deterministic_analysis"])
