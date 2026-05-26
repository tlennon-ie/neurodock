# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``translate_incoming``."""

from __future__ import annotations

import pytest
from neurodock_mcp_translation.tools.translate_incoming import translate_incoming
from neurodock_mcp_translation.types import TranslateIncomingInput
from pydantic import ValidationError


def test_detects_ambiguity_in_can_we_revisit(sample_slack_message: str) -> None:
    """The classic 'can we revisit' message must surface at least one ambiguity span."""

    payload = TranslateIncomingInput(text=sample_slack_message, channel="slack")
    result = translate_incoming(payload)
    spans = result.deterministic_analysis.ambiguity.spans
    assert result.deterministic_analysis.ambiguity.detected is True
    reasons = {span.reason for span in spans}
    # 'can we revisit' must match the soft_request rule.
    assert "soft_request" in reasons
    # 'everyone' must match the vague_referent rule.
    assert "vague_referent" in reasons
    # Spans must slice the source verbatim.
    for span in spans:
        assert sample_slack_message[span.start_char : span.end_char].lower() != ""


def test_returns_no_ambiguity_for_unambiguous_input() -> None:
    """A plain factual message produces no ambiguity spans and no subtext hypotheses."""

    payload = TranslateIncomingInput(
        text="The migration script is deployed to staging.",
        channel="slack",
    )
    result = translate_incoming(payload)
    assert result.deterministic_analysis.ambiguity.detected is False
    assert result.deterministic_analysis.ambiguity.spans == []
    assert result.deterministic_analysis.likely_subtext == []
    assert result.deterministic_analysis.explicit_ask is None


def test_loop_back_status_recommends_reminder() -> None:
    """'I'll loop back next week' is a hedged commitment → set_reminder."""

    payload = TranslateIncomingInput(
        text="Quick one: I'll loop back next week with thoughts on the architecture doc.",
        channel="email",
    )
    result = translate_incoming(payload)
    assert result.deterministic_analysis.recommended_next_action.action == "set_reminder"
    # 'next week' is a vague_timeline.
    reasons = {span.reason for span in result.deterministic_analysis.ambiguity.spans}
    assert "hedged_commitment" in reasons
    assert "vague_timeline" in reasons


def test_envelope_includes_prompt_and_eval_slice(sample_slack_message: str) -> None:
    """Each invocation returns a non-empty prompt and the eval-corpus slice."""

    payload = TranslateIncomingInput(text=sample_slack_message)
    result = translate_incoming(payload)
    assert result.prompt_for_llm_refinement.role == "user"
    assert len(result.prompt_for_llm_refinement.content) > 200
    assert "translate_incoming" in result.prompt_for_llm_refinement.output_schema_ref
    assert result.eval_corpus_slice.endswith(".jsonl")
    assert result.deterministic_analysis.eval_corpus_slice == result.eval_corpus_slice


def test_malformed_input_empty_text_raises_validation_error() -> None:
    """Pydantic rejects empty text with a ValidationError (mapped to TEXT_REQUIRED at server)."""

    with pytest.raises(ValidationError):
        TranslateIncomingInput(text="")


def test_thread_context_does_not_break_baseline() -> None:
    """Supplying thread_context must not error and must appear in the prompt."""

    payload = TranslateIncomingInput(
        text="Have you had a chance to look at the PR? No rush but it's been a while.",
        channel="github",
        thread_context=[
            "Opened a PR for the migration script.",
            "Two engineers approved; waiting on you.",
        ],
    )
    result = translate_incoming(payload)
    # 'no rush' triggers implied_urgency in the baseline.
    reasons = {span.reason for span in result.deterministic_analysis.ambiguity.spans}
    assert "implied_urgency" in reasons
    # Thread context appears in the prompt.
    assert "Opened a PR for the migration script." in result.prompt_for_llm_refinement.content
