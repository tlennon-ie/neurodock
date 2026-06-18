# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Structural guard (ADR 0005 §2): the server imports NO LLM vendor SDK.

This is the substrate-server doctrine made executable. The translation server
only ASSEMBLES prompt text (now including the ADR 0012 neurotype addendum); it
must never gain a model client. A grep over the package source keeps that
boundary honest as the package grows.
"""

from __future__ import annotations

import re
from pathlib import Path

_SRC = Path(__file__).resolve().parents[1] / "src" / "neurodock_mcp_translation"

# Match an actual import statement for a vendor LLM SDK, not a mention in a
# docstring/comment (those legitimately name the SDKs we DON'T import).
_FORBIDDEN = re.compile(
    r"^\s*(?:import|from)\s+"
    r"(anthropic|openai|ollama|cohere|google\.generativeai|google\.genai|mistralai|groq)\b",
    re.MULTILINE,
)


def test_server_source_imports_no_llm_sdk() -> None:
    offenders: list[str] = []
    for path in _SRC.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if _FORBIDDEN.search(text):
            offenders.append(str(path))
    assert not offenders, f"LLM SDK import found in: {offenders}"
