# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""The ``reader_context`` input is additive: it validates against every tool's
``input`` sub-schema, and existing inputs (no reader_context) still validate.
"""

from __future__ import annotations

from typing import Any

import pytest
from jsonschema import Draft202012Validator

_TOOLS = ("translate_incoming", "check_tone", "rewrite_outgoing", "brief_meeting")

_MINIMAL_INPUT: dict[str, dict[str, Any]] = {
    "translate_incoming": {"text": "Please review the doc."},
    "check_tone": {"text": "This is broken."},
    "rewrite_outgoing": {"text": "This is broken.", "target_register": "warm"},
    "brief_meeting": {"transcript": "Priya: own the script?\nThomas: yes.", "me": "Thomas"},
}

_READER_CONTEXT: dict[str, Any] = {
    "neurotypes": ["adhd", "asd"],
    "output_format": "bullet_first",
    "max_chunk_size": 3,
    "voice_input_preferred": True,
    "additional_notes": "Please quote the source.",
}


def _input_validator(schema: dict[str, Any]) -> Draft202012Validator:
    input_schema = dict(schema["properties"]["input"])
    if "$defs" in schema:
        input_schema = {**input_schema, "$defs": schema["$defs"]}
    return Draft202012Validator(input_schema)


@pytest.mark.parametrize("tool", _TOOLS)
def test_input_without_reader_context_still_validates(
    schemas: dict[str, dict[str, Any]], tool: str
) -> None:
    _input_validator(schemas[tool]).validate(_MINIMAL_INPUT[tool])


@pytest.mark.parametrize("tool", _TOOLS)
def test_input_with_reader_context_validates(schemas: dict[str, dict[str, Any]], tool: str) -> None:
    payload = {**_MINIMAL_INPUT[tool], "reader_context": _READER_CONTEXT}
    _input_validator(schemas[tool]).validate(payload)


@pytest.mark.parametrize("tool", _TOOLS)
def test_reader_context_tolerates_extra_keys(schemas: dict[str, dict[str, Any]], tool: str) -> None:
    payload = {
        **_MINIMAL_INPUT[tool],
        "reader_context": {"neurotypes": ["ocd"], "future_knob": 1},
    }
    _input_validator(schemas[tool]).validate(payload)


@pytest.mark.parametrize("tool", _TOOLS)
def test_reader_context_rejects_unknown_neurotype_enum(
    schemas: dict[str, dict[str, Any]], tool: str
) -> None:
    payload = {**_MINIMAL_INPUT[tool], "reader_context": {"neurotypes": ["not_a_type"]}}
    errors = list(_input_validator(schemas[tool]).iter_errors(payload))
    assert errors, "an out-of-enum neurotype should fail validation"
