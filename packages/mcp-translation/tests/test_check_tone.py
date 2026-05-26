# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``check_tone``."""

from __future__ import annotations

import pytest
from neurodock_mcp_translation.tools.check_tone import check_tone
from neurodock_mcp_translation.types import CheckToneInput
from pydantic import ValidationError


def test_flags_strong_nack_above_baseline_delta(
    sample_pr_comment: str, sample_warm_baseline: list[str]
) -> None:
    """A blunt PR comment on a warm baseline must drop warmth and surface a flagged phrase."""

    payload = CheckToneInput(
        text=sample_pr_comment,
        baseline_messages=sample_warm_baseline,
        target_register="direct",
        channel="github",
    )
    result = check_tone(payload)
    analysis = result.deterministic_analysis
    assert analysis.baseline_delta is not None
    # Warmth should drop substantially from the warm baseline.
    assert analysis.baseline_delta.warmth < -25
    # Directness should rise.
    assert analysis.baseline_delta.directness > 0
    # 'Strong nack.' must surface in flagged_phrases.
    flagged_phrases = [phrase.phrase.lower() for phrase in analysis.flagged_phrases]
    assert any("nack" in phrase for phrase in flagged_phrases)
    # axes_target is populated when target_register is supplied.
    assert analysis.axes_target is not None


def test_returns_balanced_axes_for_neutral_text() -> None:
    """Plain factual text scores near the middle of all axes and has no flags."""

    payload = CheckToneInput(text="The migration script ran successfully in staging.")
    result = check_tone(payload)
    axes = result.deterministic_analysis.axes
    # Allow ±15 around 50 for each axis under the baseline scorer.
    assert 35 <= axes.directness <= 65
    assert 35 <= axes.warmth <= 65
    assert 35 <= axes.urgency <= 65
    # No baseline_delta when fewer than 3 baselines.
    assert result.deterministic_analysis.baseline_delta is None
    # No flagged phrases for plain factual content.
    assert result.deterministic_analysis.flagged_phrases == []


def test_baseline_delta_null_when_fewer_than_three_baselines() -> None:
    """Two baseline messages is insufficient — baseline_delta must be null."""

    payload = CheckToneInput(
        text="Please ship this fix today.",
        baseline_messages=["Hey there", "Thanks for the help"],
    )
    result = check_tone(payload)
    assert result.deterministic_analysis.baseline_delta is None


def test_malformed_input_empty_text_raises_validation_error() -> None:
    with pytest.raises(ValidationError):
        CheckToneInput(text="")


def test_invalid_target_register_raises_validation_error() -> None:
    """target_register must be one of the v0.1.0 enum values."""

    with pytest.raises(ValidationError):
        CheckToneInput(text="hello", target_register="bossy")  # type: ignore[arg-type]


def test_eod_phrase_lifts_urgency_and_flags() -> None:
    """A message with a hard same-day deadline must register as urgent."""

    payload = CheckToneInput(
        text="Hey — heads up that this is broken on my end. Any chance you can land a fix before EOD?",
        channel="slack",
    )
    result = check_tone(payload)
    axes = result.deterministic_analysis.axes
    assert axes.urgency > 50
    # 'before EOD' should appear as a flagged phrase on the urgency axis.
    phrases = [
        (phrase.phrase.lower(), phrase.axis)
        for phrase in result.deterministic_analysis.flagged_phrases
    ]
    assert any("eod" in phrase and axis == "urgency" for phrase, axis in phrases)
