"""Unit tests for the check_hyperfocus v0.0.2 live runtime."""

from __future__ import annotations

import pytest
from neurodock_mcp_guardrail.tools.check_hyperfocus import (
    SessionIdMismatchError,
    check_hyperfocus,
)
from neurodock_mcp_guardrail.types import (
    ChronometricSnapshot,
    HyperfocusInput,
    OpenSessionSnapshot,
)
from pydantic import ValidationError

_INTENT = "send the RFC reply and stop by 6:30"
_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000"


def _input(
    elapsed_seconds: int,
    *,
    now: str = "2026-05-16T15:00:00+01:00",
    end_of_day_local: str | None = None,
    session_open: bool = True,
) -> HyperfocusInput:
    open_session = None
    if session_open:
        open_session = OpenSessionSnapshot(
            session_id=_SESSION_ID,
            started_at="2026-05-16T13:00:00+01:00",
            intent=_INTENT,
            elapsed_seconds=elapsed_seconds,
        )
    snap = ChronometricSnapshot(open_session=open_session, now=now)
    return HyperfocusInput(
        chronometric_snapshot=snap,
        hyperfocus_break_minutes=90,
        end_of_day_local=end_of_day_local,
    )


def test_no_session_returns_level_none() -> None:
    result = check_hyperfocus(_input(0, session_open=False))
    assert result.level == "none"
    assert result.elapsed_seconds == 0
    assert result.prior_intent is None
    assert result.override_options == []
    assert result.reason == "No open session; nothing to evaluate."


def test_elapsed_below_gentle_returns_level_none() -> None:
    result = check_hyperfocus(_input(30 * 60))
    assert result.level == "none"
    assert result.elapsed_seconds == 30 * 60
    assert result.override_options == []


def test_gentle_level_at_60_percent_of_threshold() -> None:
    result = check_hyperfocus(_input(60 * 60))
    assert result.level == "gentle"
    assert result.prior_intent == _INTENT
    assert result.suggested_action == "stand_and_stretch"
    assert {opt.token for opt in result.override_options} == {"disable-for-session"}


def test_nudge_level_at_100_percent_of_threshold() -> None:
    result = check_hyperfocus(_input(100 * 60))
    assert result.level == "nudge"
    assert result.prior_intent == _INTENT
    tokens = {opt.token for opt in result.override_options}
    assert tokens == {"snooze-15m", "commit-and-close", "extend-end-of-day", "disable-for-session"}


def test_hard_level_past_133_percent_of_threshold() -> None:
    result = check_hyperfocus(_input(125 * 60))
    assert result.level == "hard"
    assert result.prior_intent == _INTENT
    assert result.suggested_action == "quote_prior_intent_and_offer_close"
    tokens = {opt.token for opt in result.override_options}
    assert "commit-and-close" in tokens
    assert "snooze-15m" in tokens


def test_end_of_day_escalates_gentle_to_nudge() -> None:
    result = check_hyperfocus(
        _input(
            60 * 60,
            now="2026-05-16T15:00:00+01:00",
            end_of_day_local="14:00",
        )
    )
    assert result.level == "nudge"
    assert result.time_since_stated_end is not None
    assert result.time_since_stated_end.startswith("PT")


def test_end_of_day_escalates_nudge_to_hard() -> None:
    result = check_hyperfocus(
        _input(
            100 * 60,
            now="2026-05-16T19:00:00+01:00",
            end_of_day_local="18:30",
        )
    )
    assert result.level == "hard"
    assert result.time_since_stated_end is not None


def test_override_options_non_empty_when_level_not_none() -> None:
    for elapsed_minutes in (60, 100, 125):
        result = check_hyperfocus(_input(elapsed_minutes * 60))
        assert result.level != "none"
        assert len(result.override_options) >= 1


def test_prior_intent_quoted_verbatim_in_nudge_and_hard() -> None:
    intent = "ship the v0.0.2 RFC and DO NOT touch the database adapter"
    snap = ChronometricSnapshot(
        open_session=OpenSessionSnapshot(
            session_id=_SESSION_ID,
            started_at="2026-05-16T13:00:00+01:00",
            intent=intent,
            elapsed_seconds=100 * 60,
        ),
        now="2026-05-16T14:40:00+01:00",
    )
    nudge = check_hyperfocus(HyperfocusInput(chronometric_snapshot=snap))
    assert nudge.level == "nudge"
    assert nudge.prior_intent == intent

    snap2 = ChronometricSnapshot(
        open_session=OpenSessionSnapshot(
            session_id=_SESSION_ID,
            started_at="2026-05-16T13:00:00+01:00",
            intent=intent,
            elapsed_seconds=125 * 60,
        ),
        now="2026-05-16T15:05:00+01:00",
    )
    hard = check_hyperfocus(HyperfocusInput(chronometric_snapshot=snap2))
    assert hard.level == "hard"
    assert hard.prior_intent == intent


def test_session_id_mismatch_raises() -> None:
    snap = ChronometricSnapshot(
        open_session=OpenSessionSnapshot(
            session_id=_SESSION_ID,
            started_at="2026-05-16T13:00:00+01:00",
            intent=_INTENT,
            elapsed_seconds=100 * 60,
        ),
        now="2026-05-16T14:40:00+01:00",
    )
    payload = HyperfocusInput(
        chronometric_snapshot=snap,
        session_id="00000000-0000-0000-0000-000000000000",
    )
    with pytest.raises(SessionIdMismatchError):
        check_hyperfocus(payload)


def test_heuristic_descriptor_published() -> None:
    result = check_hyperfocus(_input(100 * 60))
    assert result.heuristic.name == "elapsed_threshold_with_eod"
    assert result.heuristic.version == "0.2.0"


def test_false_positive_feedback_path_always_populated() -> None:
    for elapsed in (0, 60 * 60, 100 * 60, 200 * 60):
        result = check_hyperfocus(_input(elapsed))
        assert result.false_positive_feedback_path.startswith("https://")


def test_input_schema_validates_required_fields() -> None:
    with pytest.raises(ValidationError):
        ChronometricSnapshot()  # type: ignore[call-arg]
    snap = ChronometricSnapshot(open_session=None, now="2026-05-16T14:00:00+01:00")
    assert snap.open_session is None
