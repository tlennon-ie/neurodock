"""``check_sycophancy`` v0.0.1 schema-only stub.

Same pattern as :mod:`check_hyperfocus`: input is validated against the
locked v0.1.0 schema; the runtime returns ``DETECTOR_NOT_YET_IMPLEMENTED``
until Phase 3 field-study endorsement.
"""

from __future__ import annotations

from neurodock_mcp_guardrail.tools.check_hyperfocus import DetectorNotYetImplementedError
from neurodock_mcp_guardrail.types import SycophancyInput


class SycophancyInputMissingError(ValueError):
    """Raised when neither ``candidate_response`` nor ``recent_user_messages`` is provided.

    The schema enforces ``anyOf`` at the JSON-Schema level; Pydantic does not
    natively express that constraint, so the server layer checks it here.
    """


def check_sycophancy(payload: SycophancyInput) -> None:
    """Validate input invariants, then raise the documented stub error.

    The schema requires at least one of ``candidate_response`` or
    ``recent_user_messages`` to be present. Pydantic alone cannot enforce
    that anyOf constraint, so this function enforces it explicitly before
    the stub returns its phase-3 error. The order matters: a caller passing
    truly invalid input today should see ``INPUT_MISSING`` even before
    Phase 3, because that error remains valid in Phase 3 too.
    """
    if payload.candidate_response is None and payload.recent_user_messages is None:
        raise SycophancyInputMissingError(
            "at least one of `candidate_response` or `recent_user_messages` is required"
        )
    raise DetectorNotYetImplementedError(tool="check_sycophancy")
