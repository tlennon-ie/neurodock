# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for the check_sycophancy v0.0.2 live runtime."""

from __future__ import annotations

import pytest
from neurodock_mcp_guardrail.tools.check_sycophancy import (
    SycophancyInputMissingError,
    check_sycophancy,
)
from neurodock_mcp_guardrail.types import SycophancyInput, SycophancyRecentMessage


def _msg(text: str, at: str = "2026-05-16T13:00:00+01:00") -> SycophancyRecentMessage:
    return SycophancyRecentMessage(text=text, at=at)


def test_unconditional_agreement_detected() -> None:
    result = check_sycophancy(
        SycophancyInput(
            candidate_response="Yes, you should absolutely ship the RFC today. Great call."
        )
    )
    assert result.detected is True
    assert result.pattern == "unconditional_agreement"
    assert result.heuristic.name == "agreement_without_tradeoff_marker"
    assert result.counter_prompt is not None
    assert len(result.counter_prompt) > 0
    assert len(result.matched_spans) >= 1


def test_qualifier_voids_unconditional_agreement() -> None:
    result = check_sycophancy(
        SycophancyInput(
            candidate_response="Absolutely, but there is a cost: you lose multi-writer scenarios."
        )
    )
    assert result.detected is False
    result_2 = check_sycophancy(
        SycophancyInput(
            candidate_response="Yes, however the trade-off is real and you should weigh it."
        )
    )
    assert result_2.detected is False


def test_praise_without_evidence_detected() -> None:
    result = check_sycophancy(
        SycophancyInput(candidate_response="Brilliant idea! That is exactly what you should do.")
    )
    assert result.detected is True
    assert result.pattern == "praise_without_evidence"
    assert result.heuristic.name == "opening_affirmation_without_citation"
    assert result.counter_prompt is not None


def test_praise_with_citation_is_not_detected() -> None:
    result = check_sycophancy(
        SycophancyInput(
            candidate_response=(
                "Brilliant point, because the data shows that this approach works in your "
                "constraints."
            )
        )
    )
    assert result.detected is False


def test_escalating_validation_detected() -> None:
    result = check_sycophancy(
        SycophancyInput(
            candidate_response="Use Postgres for write-heavy workloads. Great question!"
        )
    )
    assert result.detected is True
    assert result.pattern == "escalating_validation"
    assert result.heuristic.name == "agreement_intensity_delta"


def test_dense_absolute_praise_detected() -> None:
    # The 2026-06-10 retest case: blatant over-validation NOT at the opening, so
    # the opener/ending detectors miss it. Multiple absolute-praise markers with
    # no citation and no qualifier must now be caught.
    result = check_sycophancy(
        SycophancyInput(
            candidate_response=(
                "Honestly this is absolutely brilliant — you're so right, it's "
                "perfect, what a genius idea, you totally nailed it."
            )
        )
    )
    assert result.detected is True
    assert result.pattern == "praise_without_evidence"
    assert len(result.matched_spans) >= 2


def test_two_praise_markers_detected() -> None:
    result = check_sycophancy(
        SycophancyInput(candidate_response="What a genius idea, and a perfect plan.")
    )
    assert result.detected is True
    assert result.pattern == "praise_without_evidence"


def test_praise_density_voided_by_citation() -> None:
    # Dense praise that is grounded in evidence is NOT sycophancy.
    result = check_sycophancy(
        SycophancyInput(
            candidate_response=(
                "A genius idea and a perfect fit, because the benchmark shows 3x "
                "throughput on your workload."
            )
        )
    )
    assert result.detected is False
    assert result.pattern == "none"


def test_praise_density_voided_by_qualifier() -> None:
    # Dense praise tempered by a trade-off marker is balanced, not sycophantic.
    result = check_sycophancy(
        SycophancyInput(
            candidate_response=(
                "A genius idea and a perfect fit, but it won't scale past 10k writes."
            )
        )
    )
    assert result.detected is False
    assert result.pattern == "none"


def test_single_praise_marker_not_detected() -> None:
    # One incidental superlative is below the density threshold.
    result = check_sycophancy(
        SycophancyInput(candidate_response="That is a perfect use case for SQLite here.")
    )
    assert result.detected is False
    assert result.pattern == "none"


def test_two_reassurance_messages_below_threshold() -> None:
    result = check_sycophancy(
        SycophancyInput(
            recent_user_messages=[
                _msg("is this ok to ship today?", "2026-05-16T13:00:00+01:00"),
                _msg("am I sure I should do this?", "2026-05-16T13:20:00+01:00"),
            ],
            decision_context="ship v0.2 RFC today",
        )
    )
    assert result.detected is False
    assert result.pattern == "none"


def test_three_reassurance_messages_at_threshold_detected() -> None:
    result = check_sycophancy(
        SycophancyInput(
            recent_user_messages=[
                _msg("is this okay to ship today?", "2026-05-16T13:00:00+01:00"),
                _msg("am I sure this is the right call?", "2026-05-16T13:20:00+01:00"),
                _msg("should I really go ahead today?", "2026-05-16T13:45:00+01:00"),
            ],
            decision_context="ship v0.2 RFC today",
        )
    )
    assert result.detected is True
    assert result.pattern == "repeated_reassurance_request"
    assert result.heuristic.name == "reassurance_request_count"
    assert len(result.matched_spans) == 3
    for span in result.matched_spans:
        assert span.source == "recent_user_messages"


def test_counter_prompt_non_empty_on_detection() -> None:
    cases = [
        SycophancyInput(candidate_response="Yes, that is exactly what you should do."),
        SycophancyInput(candidate_response="Brilliant! Go ahead."),
        SycophancyInput(
            recent_user_messages=[
                _msg("is this okay?", "2026-05-16T13:00:00+01:00"),
                _msg("am I sure?", "2026-05-16T13:10:00+01:00"),
                _msg("should I really?", "2026-05-16T13:20:00+01:00"),
            ]
        ),
    ]
    for case in cases:
        result = check_sycophancy(case)
        assert result.detected is True
        assert result.counter_prompt is not None
        assert len(result.counter_prompt) > 20


def test_override_options_include_i_want_validation_and_override_once() -> None:
    result = check_sycophancy(SycophancyInput(candidate_response="Yes, that is exactly right."))
    assert result.detected is True
    tokens = {opt.token for opt in result.override_options}
    assert "i-want-validation" in tokens
    assert "override-once" in tokens


def test_input_missing_raises() -> None:
    with pytest.raises(SycophancyInputMissingError):
        check_sycophancy(SycophancyInput(decision_context="anything"))


def test_balanced_response_with_tradeoff_marker_is_not_detected() -> None:
    result = check_sycophancy(
        SycophancyInput(
            candidate_response=(
                "Postgres gives you better concurrency but at the cost of operational "
                "overhead; given your local-first constraint, SQLite is the more honest "
                "choice. Trade-off: you give up future multi-writer scenarios."
            ),
            decision_context="database choice for neurodock substrate",
        )
    )
    assert result.detected is False
    assert result.pattern == "none"
    assert result.counter_prompt is None


def test_false_positive_feedback_path_always_populated() -> None:
    result = check_sycophancy(
        SycophancyInput(candidate_response="The user should consider both options.")
    )
    assert result.false_positive_feedback_path.startswith("https://")
    detected = check_sycophancy(SycophancyInput(candidate_response="Yes, exactly right."))
    assert detected.false_positive_feedback_path.startswith("https://")


def test_heuristic_descriptor_published_on_non_detection() -> None:
    result = check_sycophancy(
        SycophancyInput(candidate_response="The user should consider both options.")
    )
    assert result.detected is False
    assert result.heuristic.name == "none"
    assert result.heuristic.version == "0.2.0"
