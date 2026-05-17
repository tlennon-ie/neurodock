"""Unit tests for the ``check_rumination`` tool.

These cover the contract behaviours called out in ADR 0006 §2, §6, §9 and
``ETHICS.md`` commitments 2, 3, 5.
"""

from __future__ import annotations

import pytest
from neurodock_mcp_guardrail.tools.check_rumination import (
    HistoryOutOfOrderError,
    check_rumination,
)
from neurodock_mcp_guardrail.types import (
    RuminationHistoryItem,
    RuminationInput,
)


def _history(*items: tuple[str, str]) -> list[RuminationHistoryItem]:
    return [RuminationHistoryItem(text=text, at=at) for text, at in items]


def test_empty_history_returns_not_detected() -> None:
    payload = RuminationInput(
        current_prompt="should I use Postgres or SQLite for this?",
        history=[],
    )
    result = check_rumination(payload)
    assert result.detected is False
    assert result.count == 0
    assert result.similar_prompts == []
    assert result.override_options == []
    # ETHICS.md commitment 3: heuristic descriptor is populated even on
    # non-detection, so users auditing the no-op call see the rule.
    assert result.heuristic.name == "word_overlap_jaccard"
    assert result.heuristic.version == "0.1.0"
    assert result.window_seconds == 90 * 60


def test_three_similar_prompts_within_window_trigger_detection() -> None:
    # ND-realistic re-validation pattern: same database anxiety, three
    # paraphrases within 75 minutes. With similarity_threshold=0.2 these all
    # match against the current prompt (the post-stoplist Jaccard scores are
    # 0.75, 0.33, 0.25 against {use, postgres, sqlite, better}).
    payload = RuminationInput(
        current_prompt="should I really use Postgres for this or is SQLite better?",
        history=_history(
            ("should I use Postgres or SQLite for this?", "2026-05-16T13:02:00+01:00"),
            ("is Postgres really the right choice over SQLite here?", "2026-05-16T13:34:00+01:00"),
            ("am I sure Postgres beats SQLite for this workload?", "2026-05-16T14:05:00+01:00"),
        ),
        window_minutes=90,
        threshold_count=3,
        similarity_threshold=0.2,
    )
    result = check_rumination(payload)
    assert result.detected is True
    assert result.count == 3
    assert len(result.similar_prompts) == 3
    # ADR 0006 §2: detected==true MUST yield non-empty override_options
    # including override-once and fresh-context.
    tokens = {opt.token for opt in result.override_options}
    assert "override-once" in tokens
    assert "fresh-context" in tokens
    # Per the schema the reason is a single plain-language sentence.
    assert "matched" in result.reason
    # similar_prompts are oldest-first.
    assert result.similar_prompts[0].at < result.similar_prompts[-1].at


def test_same_prompts_outside_window_do_not_trigger() -> None:
    # Identical history to the previous test but the earlier prompts are
    # 3 hours before the latest, with a tight 30-minute window. Only the
    # most recent will fall inside the window.
    payload = RuminationInput(
        current_prompt="should I really use Postgres for this or is SQLite better?",
        history=_history(
            ("should I use Postgres or SQLite for this?", "2026-05-16T11:00:00+01:00"),
            ("is Postgres really the right choice over SQLite here?", "2026-05-16T11:30:00+01:00"),
            ("am I sure Postgres beats SQLite for this workload?", "2026-05-16T14:00:00+01:00"),
        ),
        window_minutes=30,
        threshold_count=3,
        similarity_threshold=0.2,
    )
    result = check_rumination(payload)
    # The two earlier items are outside the 30-minute window relative to the
    # latest history item (14:00). Only one is inside → below threshold.
    assert result.detected is False
    assert result.count < 3
    assert result.override_options == []


def test_two_similar_prompts_do_not_trigger_threshold_three() -> None:
    payload = RuminationInput(
        current_prompt="should I really use Postgres for this?",
        history=_history(
            ("should I use Postgres for this?", "2026-05-16T13:30:00+01:00"),
            ("am I sure Postgres is the right call?", "2026-05-16T14:00:00+01:00"),
        ),
        window_minutes=90,
        threshold_count=3,
        similarity_threshold=0.3,
    )
    result = check_rumination(payload)
    assert result.detected is False
    # The schema permits similar_prompts to be populated when detection is
    # false; the gate is the count.
    assert result.count < 3
    assert result.override_options == []


def test_custom_window_and_threshold_are_honoured() -> None:
    # With a smaller threshold_count=2 and the same data as the previous
    # test, the detector now fires.
    payload = RuminationInput(
        current_prompt="should I really use Postgres for this?",
        history=_history(
            ("should I use Postgres for this?", "2026-05-16T13:30:00+01:00"),
            ("am I sure Postgres is the right call?", "2026-05-16T14:00:00+01:00"),
        ),
        window_minutes=60,
        threshold_count=2,
        similarity_threshold=0.15,
    )
    result = check_rumination(payload)
    assert result.detected is True
    assert result.threshold == 2
    assert result.window_seconds == 60 * 60


def test_override_options_always_contain_required_tokens_when_detected() -> None:
    # Stress: detected==true MUST contain {override-once, fresh-context}.
    # ADR 0006 §2: "v0.1.0 always returns at minimum override-once and
    # fresh-context."
    payload = RuminationInput(
        current_prompt="should I keep Postgres for this?",
        history=_history(
            ("should I really use Postgres for this?", "2026-05-16T13:00:00+01:00"),
            ("am I sure Postgres for this?", "2026-05-16T13:20:00+01:00"),
            ("should I keep Postgres for this anyway?", "2026-05-16T13:45:00+01:00"),
        ),
        window_minutes=90,
        threshold_count=3,
        similarity_threshold=0.2,
    )
    result = check_rumination(payload)
    assert result.detected is True
    tokens = [opt.token for opt in result.override_options]
    assert "override-once" in tokens
    assert "fresh-context" in tokens
    # Per the closed v0.1.0 vocabulary, no unexpected tokens.
    allowed = {"fresh-context", "override-once", "disable-for-session", "lower-sensitivity"}
    assert set(tokens) <= allowed


def test_history_out_of_order_is_rejected() -> None:
    # Schema commitment: callers do not get to rely on silent re-sorting.
    payload = RuminationInput(
        current_prompt="should I really use Postgres?",
        history=_history(
            ("am I sure Postgres is right?", "2026-05-16T14:00:00+01:00"),
            ("should I use Postgres for this?", "2026-05-16T13:30:00+01:00"),
        ),
        window_minutes=90,
        threshold_count=2,
        similarity_threshold=0.3,
    )
    with pytest.raises(HistoryOutOfOrderError):
        check_rumination(payload)


def test_false_positive_feedback_path_is_always_populated() -> None:
    # ETHICS.md commitment 5: every detection surface offers a feedback path.
    payload = RuminationInput(
        current_prompt="anything",
        history=[],
    )
    result = check_rumination(payload)
    assert result.false_positive_feedback_path.startswith("https://")
    assert "guardrail_false_positive" in result.false_positive_feedback_path
