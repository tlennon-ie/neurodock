# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``request_break_if_needed``."""

from __future__ import annotations

import pytest
from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.tools.break_request import (
    ThresholdOutOfRangeError,
    request_break_if_needed,
)
from neurodock_mcp_chronometric.tools.session import mark_session_start


def test_returns_none_when_below_threshold(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Happy path: a 5-minute-old session is below a 90-minute threshold."""

    mark_session_start(intent="work", clock=frozen_clock, state=session_state)
    frozen_clock.advance(seconds=300)  # 5 minutes

    result = request_break_if_needed(threshold_minutes=90, clock=frozen_clock, state=session_state)
    assert result is None


def test_returns_none_when_no_open_session(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Edge case: with no open session there is nothing to break from."""

    result = request_break_if_needed(threshold_minutes=60, clock=frozen_clock, state=session_state)
    assert result is None


def test_returns_suggestion_over_threshold_with_prior_intent(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Happy path: past the threshold, the suggestion echoes prior_intent."""

    mark_session_start(intent="finish draft RFC reply", clock=frozen_clock, state=session_state)
    # 91 minutes — just over a 90-minute threshold.
    frozen_clock.advance(seconds=91 * 60)

    result = request_break_if_needed(threshold_minutes=90, clock=frozen_clock, state=session_state)
    assert result is not None
    assert result.prior_intent == "finish draft RFC reply"
    assert result.threshold_minutes == 90
    assert result.suggested_action in {
        "stand_and_stretch",
        "hydrate",
        "walk_outside",
        "switch_context",
        "end_session",
    }
    # Around 91 minutes, the heuristic returns stand_and_stretch.
    assert result.suggested_action == "stand_and_stretch"


def test_rejects_threshold_out_of_range(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Malformed input: threshold must be in 1..480."""

    with pytest.raises(ThresholdOutOfRangeError):
        request_break_if_needed(threshold_minutes=0, clock=frozen_clock, state=session_state)
    with pytest.raises(ThresholdOutOfRangeError):
        request_break_if_needed(threshold_minutes=481, clock=frozen_clock, state=session_state)
