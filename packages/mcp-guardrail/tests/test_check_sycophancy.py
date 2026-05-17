"""Unit tests for the ``check_sycophancy`` schema-only v0.0.1 stub.

Same pattern as ``check_hyperfocus`` — runtime is Phase 3, input shape is
enforced today.
"""

from __future__ import annotations

import pytest
from neurodock_mcp_guardrail.tools.check_hyperfocus import DetectorNotYetImplementedError
from neurodock_mcp_guardrail.tools.check_sycophancy import (
    SycophancyInputMissingError,
    check_sycophancy,
)
from neurodock_mcp_guardrail.types import (
    SycophancyInput,
    SycophancyRecentMessage,
)


def test_stub_raises_detector_not_yet_implemented_with_phase_3() -> None:
    payload = SycophancyInput(
        candidate_response=(
            "Postgres gives you better concurrency and JSON ops but at the cost of operational "
            "overhead; SQLite is the more honest choice for your local-first constraint."
        ),
        decision_context="database choice for neurodock substrate",
    )
    with pytest.raises(DetectorNotYetImplementedError) as exc_info:
        check_sycophancy(payload)
    assert exc_info.value.phase == "3"
    assert exc_info.value.tool == "check_sycophancy"


def test_input_validates_anyof_constraint() -> None:
    # Neither candidate_response nor recent_user_messages provided.
    payload = SycophancyInput(decision_context="ship v0.2 RFC today")
    with pytest.raises(SycophancyInputMissingError):
        check_sycophancy(payload)

    # Just recent_user_messages — valid, falls through to the phase-3 stub.
    payload = SycophancyInput(
        recent_user_messages=[
            SycophancyRecentMessage(
                text="is shipping the v0.2 RFC today the right call?",
                at="2026-05-16T13:00:00+01:00",
            )
        ],
        decision_context="ship v0.2 RFC today",
    )
    with pytest.raises(DetectorNotYetImplementedError):
        check_sycophancy(payload)
