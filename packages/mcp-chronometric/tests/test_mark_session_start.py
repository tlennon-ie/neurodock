# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``mark_session_start``."""

from __future__ import annotations

import re

import pytest
from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.tools.session import (
    IntentRequiredError,
    IntentTooLongError,
    mark_session_start,
)

UUID4_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def test_returns_valid_uuidv4_and_echoes_intent(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Happy path: returns a properly-formatted v4 UUID and echoes intent."""

    result = mark_session_start(
        intent="finish draft RFC reply", clock=frozen_clock, state=session_state
    )
    assert UUID4_RE.match(result.session_id), result.session_id
    assert result.intent == "finish draft RFC reply"
    assert result.auto_closed_prior_session is None


def test_auto_closes_prior_session_and_surfaces_metadata(
    frozen_clock: FrozenClock, session_state: SessionState
) -> None:
    """Edge case: an already-open session is auto-closed and surfaced."""

    first = mark_session_start(intent="triage inbox", clock=frozen_clock, state=session_state)
    frozen_clock.advance(seconds=60)
    second = mark_session_start(intent="now write the doc", clock=frozen_clock, state=session_state)

    assert second.session_id != first.session_id
    assert second.auto_closed_prior_session is not None
    assert second.auto_closed_prior_session.prior_session_id == first.session_id


def test_rejects_empty_intent(frozen_clock: FrozenClock, session_state: SessionState) -> None:
    """Malformed input: empty or whitespace-only intent raises."""

    with pytest.raises(IntentRequiredError):
        mark_session_start(intent="", clock=frozen_clock, state=session_state)
    with pytest.raises(IntentRequiredError):
        mark_session_start(intent="   ", clock=frozen_clock, state=session_state)


def test_rejects_overlong_intent(frozen_clock: FrozenClock, session_state: SessionState) -> None:
    """Malformed input: >500-character intent raises."""

    with pytest.raises(IntentTooLongError):
        mark_session_start(intent="x" * 501, clock=frozen_clock, state=session_state)
