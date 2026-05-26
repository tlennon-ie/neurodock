# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Shared fixtures for translation server tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"


@pytest.fixture
def schemas() -> dict[str, dict[str, Any]]:
    """Load all four JSON Schemas keyed by tool name."""

    out: dict[str, dict[str, Any]] = {}
    for path in SCHEMAS_DIR.glob("*.schema.json"):
        name = path.name.removesuffix(".schema.json")
        out[name] = json.loads(path.read_text(encoding="utf-8"))
    return out


@pytest.fixture
def sample_meeting_transcript() -> str:
    """A short rollout meeting transcript with one ask, one decision, one ambiguous item."""

    return (
        "Priya: Let's get the rollout date on the calendar. Thomas, can you own the migration script?\n"
        "Thomas: Yes — I'll have it ready by Wednesday.\n"
        "Roberto: We should also think about rollback. Can someone draft the runbook?\n"
        "Priya: We can circle back on that next week.\n"
    )


@pytest.fixture
def sample_strategy_transcript() -> str:
    """A strategy meeting with two ambiguous items and no decisions."""

    return (
        "Director: I want us to revisit the Q3 priorities. The current list doesn't feel right.\n"
        "Thomas: Which priorities specifically?\n"
        "Director: We'll work through that offline. For now I'd like everyone to think about it before next Friday.\n"
        "Priya: I'll loop back with thoughts on the architecture doc next week.\n"
    )


@pytest.fixture
def sample_slack_message() -> str:
    return "Hey — can we revisit the rollout timeline? I'm not sure everyone is aligned."


@pytest.fixture
def sample_pr_comment() -> str:
    return (
        "Strong nack. The approach in section 3 will not scale and we need to revisit before merge."
    )


@pytest.fixture
def sample_warm_baseline() -> list[str]:
    return [
        "Thanks for the writeup — really useful framing.",
        "Happy to pair on this tomorrow if helpful.",
        "Good catch on the migration edge case; let's land that fix first.",
    ]
