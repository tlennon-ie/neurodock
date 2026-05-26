# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Deterministic-baseline heuristics for the translation server.

These modules implement the v0.0.1 deterministic baseline. The LLM-refinement
prompt that each tool returns alongside the deterministic result is what the
caller's MCP client uses to refine these baselines into the v0.1.0 wire shape.
"""

from neurodock_mcp_translation.heuristics.ambiguity import AmbiguityHit, find_ambiguities
from neurodock_mcp_translation.heuristics.quote_extractor import (
    LineHit,
    TranscriptLine,
    find_asks,
    find_decisions,
    find_due_hint,
    index_lines,
)
from neurodock_mcp_translation.heuristics.quote_extractor import (
    find_ambiguities as find_transcript_ambiguities,
)
from neurodock_mcp_translation.heuristics.tone import (
    FlaggedPhraseHit,
    ToneScore,
    find_flagged_phrases,
    score_tone,
    target_axes,
)

__all__ = [
    "AmbiguityHit",
    "FlaggedPhraseHit",
    "LineHit",
    "ToneScore",
    "TranscriptLine",
    "find_ambiguities",
    "find_asks",
    "find_decisions",
    "find_due_hint",
    "find_flagged_phrases",
    "find_transcript_ambiguities",
    "index_lines",
    "score_tone",
    "target_axes",
]
