# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``mark_session_end``."""

from __future__ import annotations

import pytest
from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.tools.session import (
    NoOpenSessionError,
    SummaryTooLongError,
    mark_session_end,
    mark_session_start,
)


def test_closes_current_session_with_summary(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Happy path: closes the open session and preserves the summary."""

    start = mark_session_start(
        intent="write the migration ADR", clock=frozen_clock, state=session_state
    )
    frozen_clock.advance(seconds=600)  # 10 minutes
    end = mark_session_end(summary="shipped the ADR", clock=frozen_clock, state=session_state)

    assert end.session_id == start.session_id
    assert end.intent == "write the migration ADR"
    assert end.summary == "shipped the ADR"
    assert end.duration == "PT10M"


def test_errors_when_no_open_session(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Malformed input / state: closing with nothing open raises."""

    with pytest.raises(NoOpenSessionError):
        mark_session_end(summary=None, clock=frozen_clock, state=session_state)


def test_double_close_raises_no_open_session(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Edge case: a second close after a successful one raises NO_OPEN_SESSION."""

    mark_session_start(intent="x", clock=frozen_clock, state=session_state)
    mark_session_end(summary=None, clock=frozen_clock, state=session_state)
    with pytest.raises(NoOpenSessionError):
        mark_session_end(summary=None, clock=frozen_clock, state=session_state)


def test_rejects_overlong_summary(frozen_clock: FrozenClock, session_state: SessionState) -> None:
    """Malformed input: >1000-character summary raises."""

    mark_session_start(intent="x", clock=frozen_clock, state=session_state)
    with pytest.raises(SummaryTooLongError):
        mark_session_end(summary="y" * 1001, clock=frozen_clock, state=session_state)


def test_summary_optional_yields_null(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Happy path: omitting summary yields ``None`` in the output."""

    mark_session_start(intent="x", clock=frozen_clock, state=session_state)
    frozen_clock.advance(seconds=30)
    end = mark_session_end(summary=None, clock=frozen_clock, state=session_state)
    assert end.summary is None
    assert end.duration == "PT30S"
