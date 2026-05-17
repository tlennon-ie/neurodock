"""``check_hyperfocus`` v0.0.1 schema-only stub.

Per ADR 0006 §1 ("Phase 2 scope") and the schema's
``x-implementation-status: schema-only-v0.1.0`` annotation, the runtime
returns ``DETECTOR_NOT_YET_IMPLEMENTED`` until the Phase 3 field study
endorses the thresholds. The schema is enforced on the input so callers
develop against the permanent contract today.
"""

from __future__ import annotations

from neurodock_mcp_guardrail.types import HyperfocusInput


class DetectorNotYetImplementedError(RuntimeError):
    """Raised by Phase-2 stubs that wait on Phase-3 field-study endorsement."""

    def __init__(
        self,
        *,
        tool: str,
        phase: str = "3",
        message: str | None = None,
    ) -> None:
        self.tool = tool
        self.phase = phase
        super().__init__(
            message
            or (
                f"{tool} runtime is not yet implemented; the schema is locked at v0.1.0 and the "
                f"runtime ships in phase {phase}. See ADR 0006 §1."
            )
        )


def check_hyperfocus(payload: HyperfocusInput) -> None:
    """Validate the input shape, then raise the documented stub error.

    The validation step is deliberate: callers should see schema-shape errors
    at the tool boundary today, not only after Phase 3 ships. Pydantic does
    the validation when the FastMCP server constructs :class:`HyperfocusInput`
    from the tool input; this function is the no-op that comes after.
    """
    # Touch the input so ruff does not flag it as unused and so future
    # implementations have an obvious anchor.
    _ = payload
    raise DetectorNotYetImplementedError(tool="check_hyperfocus")
