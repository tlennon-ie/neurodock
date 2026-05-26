# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``brief_meeting``."""

from __future__ import annotations

import pytest
from neurodock_mcp_translation.tools.brief_meeting import (
    VerbatimAnchorFailedError,
    brief_meeting,
)
from neurodock_mcp_translation.types import BriefMeetingInput
from pydantic import ValidationError


def test_my_asks_partition_correctly(sample_meeting_transcript: str) -> None:
    """'Thomas, can you own the migration script?' is placed on Thomas → my_asks."""

    payload = BriefMeetingInput(
        transcript=sample_meeting_transcript,
        me="Thomas",
        project="neurodock",
        speakers=["Priya", "Thomas", "Roberto"],
    )
    result = brief_meeting(payload)
    my_ask_texts = [ask.text for ask in result.deterministic_analysis.my_asks]
    assert any("migration script" in text.lower() for text in my_ask_texts)
    # Thomas being named in another speaker's ask line counts as 'on me'.
    askers = {ask.asker for ask in result.deterministic_analysis.my_asks}
    assert "Priya" in askers


def test_ambiguous_items_have_verbatim_quotes(sample_strategy_transcript: str) -> None:
    """Every ambiguous_item's quoted_span slices the transcript exactly."""

    payload = BriefMeetingInput(
        transcript=sample_strategy_transcript,
        me="Thomas",
        speakers=["Director", "Thomas", "Priya"],
    )
    result = brief_meeting(payload)
    ambiguous = result.deterministic_analysis.ambiguous_items
    assert len(ambiguous) >= 1
    for item in ambiguous:
        sliced = sample_strategy_transcript[item.quoted_span.start_char : item.quoted_span.end_char]
        assert sliced == item.quoted_span.text
        assert item.verbatim is True


def test_decisions_include_thomas_commitment(sample_meeting_transcript: str) -> None:
    """'Yes — I'll have it ready by Wednesday' is a decision in the baseline."""

    payload = BriefMeetingInput(
        transcript=sample_meeting_transcript,
        me="Thomas",
    )
    result = brief_meeting(payload)
    decision_texts = [decision.text.lower() for decision in result.deterministic_analysis.decisions]
    assert any("wednesday" in text for text in decision_texts)


def test_me_missing_raises_validation_error() -> None:
    """An empty 'me' fails Pydantic validation (server returns ME_REQUIRED)."""

    with pytest.raises(ValidationError):
        BriefMeetingInput(
            transcript=(
                "Priya: Let's get the rollout date on the calendar. Thomas, can you own it?"
            ),
            me="",
        )


def test_transcript_too_short_raises_validation_error() -> None:
    """A 5-character transcript fails the minLength=20 check."""

    with pytest.raises(ValidationError):
        BriefMeetingInput(transcript="hi.", me="Thomas")


def test_verbatim_anchor_failure_raises_explicit_error() -> None:
    """If the baseline produces a span that does not slice the transcript, the server raises."""

    transcript = "Priya: Let's circle back on the rollout next week.\nThomas: Sure.\n"
    payload = BriefMeetingInput(transcript=transcript, me="Thomas")
    # The baseline should not raise on a well-formed transcript.
    envelope = brief_meeting(payload)
    # Re-validate explicitly via the enforcement helper by tampering with a span.
    item = envelope.deterministic_analysis.ambiguous_items[0]
    item_copy = item.model_copy(deep=True)
    # Forge a span that no longer matches the transcript.
    item_copy.quoted_span.text = "this text is not in the transcript"
    # Re-run the enforcement directly via the helper.
    from neurodock_mcp_translation.tools.brief_meeting import _enforce_verbatim_anchors

    with pytest.raises(VerbatimAnchorFailedError):
        _enforce_verbatim_anchors([item_copy], transcript)
