# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Skill-prompt tests (ADR 0010, Phase A).

Pins the prompt surface to exactly the six stateless skill prompts and checks the
required/optional arguments. Synchronous (``asyncio.run``) so they do not depend on
pytest-asyncio auto-mode under the repo-root pytest run.
"""

from __future__ import annotations

import asyncio

from neurodock_remote.app import build_combined_server
from neurodock_remote.prompts import REMOTE_PROMPT_NAMES


def _prompts() -> dict[str, set[str]]:
    """Return {prompt_name: {required_arg_names}} for the combined server."""
    server = build_combined_server()
    listed = asyncio.run(server.list_prompts())
    return {p.name: {a.name for a in (p.arguments or []) if a.required} for p in listed}


def test_combined_exposes_exactly_the_skill_prompts() -> None:
    assert set(_prompts()) == set(REMOTE_PROMPT_NAMES)


def test_prompt_names_constant_is_the_six_stateless_skills() -> None:
    assert REMOTE_PROMPT_NAMES == {
        "translate-incoming",
        "check-tone",
        "rewrite-outgoing",
        "brief-meeting",
        "decompose-task",
        "check-rumination",
    }


def test_required_arguments_match_the_tool_inputs() -> None:
    required = _prompts()
    # The required (no-default) args mirror each tool's mandatory input.
    assert required["translate-incoming"] == {"message"}
    assert required["check-tone"] == {"draft"}
    assert required["rewrite-outgoing"] == {"draft", "target_register"}
    assert required["brief-meeting"] == {"transcript", "me"}
    assert required["decompose-task"] == {"goal"}
    assert required["check-rumination"] == {"topic"}
