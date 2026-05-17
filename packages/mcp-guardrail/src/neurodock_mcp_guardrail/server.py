"""FastMCP server wiring for the three guardrail tools.

This server is **stateless** by design (ADR 0006 §4):

* No SQLite, no JSONL, no on-disk persistence anywhere.
* No in-memory caches that survive a tool call.
* No network sockets; no telemetry.
* Logs only ``tool_invoked`` metadata (tool name, timestamp). It never logs
  the prompt, the history, or the detection outcome.

Tools registered:

* ``check_rumination`` — implemented (word-overlap Jaccard).
* ``check_hyperfocus`` — schema-only stub; returns
  ``DETECTOR_NOT_YET_IMPLEMENTED`` until Phase 3.
* ``check_sycophancy`` — same pattern.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from fastmcp import FastMCP
from pydantic import ValidationError

from neurodock_mcp_guardrail.tools.check_hyperfocus import (
    DetectorNotYetImplementedError,
    check_hyperfocus,
)
from neurodock_mcp_guardrail.tools.check_rumination import (
    HistoryOutOfOrderError,
    check_rumination,
)
from neurodock_mcp_guardrail.tools.check_sycophancy import (
    SycophancyInputMissingError,
    check_sycophancy,
)
from neurodock_mcp_guardrail.types import (
    HyperfocusInput,
    RuminationInput,
    SycophancyInput,
)

SERVER_NAME = "neurodock-mcp-guardrail"
SERVER_VERSION = "0.0.1"

_LOG = logging.getLogger("neurodock_mcp_guardrail.server")


class _ToolError(RuntimeError):
    """Internal exception type that carries an MCP-friendly error code.

    The error is surfaced to the MCP client as a structured response, never
    as a raw Python traceback. Per ADR 0006 §4 the message MUST NOT echo
    user content; the server raises generic descriptions of the failure
    kind, not the input that triggered it.
    """

    def __init__(self, code: str, message: str, *, metadata: dict[str, Any] | None = None) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.metadata = metadata or {}


def build_server() -> FastMCP[Any]:
    """Construct a fully wired FastMCP server with all three tools registered.

    No injection points are required: the server is stateless and pure. The
    same instance is safe to re-use across calls.
    """

    mcp: FastMCP[Any] = FastMCP(name=SERVER_NAME, version=SERVER_VERSION)

    @mcp.tool(
        name="check_rumination",
        description=(
            "Detect whether the user's current prompt is a semantic repeat of recent prompts "
            "within a rolling window. Stateless; returns a structured advisory signal."
        ),
    )
    def _check_rumination(
        current_prompt: str,
        history: list[dict[str, Any]],
        window_minutes: int = 90,
        threshold_count: int = 3,
        similarity_threshold: float = 0.55,
    ) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "check_rumination"})
        try:
            payload = RuminationInput.model_validate(
                {
                    "current_prompt": current_prompt,
                    "history": history,
                    "window_minutes": window_minutes,
                    "threshold_count": threshold_count,
                    "similarity_threshold": similarity_threshold,
                }
            )
        except ValidationError as exc:
            raise _ToolError("INPUT_INVALID", "input failed schema validation") from exc

        try:
            result = check_rumination(payload)
        except HistoryOutOfOrderError as exc:
            raise _ToolError("HISTORY_OUT_OF_ORDER", str(exc)) from exc
        except ValueError as exc:
            raise _ToolError("INPUT_INVALID", "input timestamps could not be parsed") from exc

        return result.model_dump(exclude_none=False)

    @mcp.tool(
        name="check_hyperfocus",
        description=(
            "Classify hyperfocus escalation from a caller-supplied chronometric snapshot. "
            "v0.0.1: schema-only; returns DETECTOR_NOT_YET_IMPLEMENTED until Phase 3."
        ),
    )
    def _check_hyperfocus(
        chronometric_snapshot: dict[str, Any],
        session_id: str | None = None,
        hyperfocus_break_minutes: int = 90,
        end_of_day_local: str | None = None,
        escalation_thresholds: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "check_hyperfocus"})
        try:
            payload = HyperfocusInput.model_validate(
                {
                    "chronometric_snapshot": chronometric_snapshot,
                    "session_id": session_id,
                    "hyperfocus_break_minutes": hyperfocus_break_minutes,
                    "end_of_day_local": end_of_day_local,
                    "escalation_thresholds": escalation_thresholds,
                }
            )
        except ValidationError as exc:
            raise _ToolError("INPUT_INVALID", "input failed schema validation") from exc

        try:
            check_hyperfocus(payload)
        except DetectorNotYetImplementedError as exc:
            raise _ToolError(
                "DETECTOR_NOT_YET_IMPLEMENTED",
                str(exc),
                metadata={"phase": exc.phase, "tool": exc.tool},
            ) from exc
        # Unreachable in v0.0.1; kept for type completeness.
        raise _ToolError("DETECTOR_NOT_YET_IMPLEMENTED", "unreachable")

    @mcp.tool(
        name="check_sycophancy",
        description=(
            "Detect over-validation in a candidate response or repeated reassurance-seeking "
            "in recent user messages. v0.0.1: schema-only; returns "
            "DETECTOR_NOT_YET_IMPLEMENTED until Phase 3."
        ),
    )
    def _check_sycophancy(
        candidate_response: str | None = None,
        recent_user_messages: list[dict[str, Any]] | None = None,
        decision_context: str | None = None,
    ) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "check_sycophancy"})
        try:
            payload = SycophancyInput.model_validate(
                {
                    "candidate_response": candidate_response,
                    "recent_user_messages": recent_user_messages,
                    "decision_context": decision_context,
                }
            )
        except ValidationError as exc:
            raise _ToolError("INPUT_INVALID", "input failed schema validation") from exc

        try:
            check_sycophancy(payload)
        except SycophancyInputMissingError as exc:
            raise _ToolError("INPUT_MISSING", str(exc)) from exc
        except DetectorNotYetImplementedError as exc:
            raise _ToolError(
                "DETECTOR_NOT_YET_IMPLEMENTED",
                str(exc),
                metadata={"phase": exc.phase, "tool": exc.tool},
            ) from exc
        # Unreachable in v0.0.1.
        raise _ToolError("DETECTOR_NOT_YET_IMPLEMENTED", "unreachable")

    return mcp


# Module-level default server, useful for ``python -m`` invocation and smoke
# tests that just want to confirm registration succeeds.
app: FastMCP[Any] = build_server()


def main() -> None:
    """Console-script entrypoint: run the server over stdio."""
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format='{"logger":"%(name)s","level":"%(levelname)s","msg":"%(message)s"}',
    )
    app.run()


if __name__ == "__main__":  # pragma: no cover - exercised via console script
    main()
