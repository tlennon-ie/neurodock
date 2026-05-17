"""Unit tests for the ``check_hyperfocus`` schema-only v0.0.1 stub.

The schema is locked at v0.1.0 (ADR 0006) but the runtime returns
``DETECTOR_NOT_YET_IMPLEMENTED`` until Phase 3 field-study endorsement.
"""

from __future__ import annotations

import pytest
from neurodock_mcp_guardrail.tools.check_hyperfocus import (
    DetectorNotYetImplementedError,
    check_hyperfocus,
)
from neurodock_mcp_guardrail.types import (
    ChronometricSnapshot,
    HyperfocusInput,
    OpenSessionSnapshot,
)
from pydantic import ValidationError


def test_stub_raises_detector_not_yet_implemented_with_phase_3() -> None:
    snapshot = ChronometricSnapshot(
        open_session=OpenSessionSnapshot(
            session_id="550e8400-e29b-41d4-a716-446655440000",
            started_at="2026-05-16T18:20:00+01:00",
            intent="send the RFC reply and stop by 6:30",
            elapsed_seconds=6420,
        ),
        now="2026-05-16T20:07:00+01:00",
    )
    payload = HyperfocusInput(
        chronometric_snapshot=snapshot,
        hyperfocus_break_minutes=90,
        end_of_day_local="18:30",
    )
    with pytest.raises(DetectorNotYetImplementedError) as exc_info:
        check_hyperfocus(payload)
    # ADR 0006 §1: the error carries a `phase: "3"` metadata field so the
    # caller can branch on schedule.
    assert exc_info.value.phase == "3"
    assert exc_info.value.tool == "check_hyperfocus"


def test_input_schema_validates_required_fields() -> None:
    # The schema is the permanent contract; callers can integrate today
    # against the input shape and trust it will not move under them.
    with pytest.raises(ValidationError):
        # Missing `now` and `open_session` — both required by the schema.
        ChronometricSnapshot()  # type: ignore[call-arg]

    # A null open_session is valid (no session open).
    snap = ChronometricSnapshot(
        open_session=None,
        now="2026-05-16T14:00:00+01:00",
    )
    assert snap.open_session is None
