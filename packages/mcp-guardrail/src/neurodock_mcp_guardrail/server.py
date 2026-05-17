"""FastMCP server wiring for the three guardrail tools."""

from __future__ import annotations

import logging
import sys
from typing import Any

from fastmcp import FastMCP
from pydantic import ValidationError

from neurodock_mcp_guardrail.tools.check_hyperfocus import (
    SessionIdMismatchError,
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
SERVER_VERSION = "0.0.2"

_LOG = logging.getLogger("neurodock_mcp_guardrail.server")


class _ToolError(RuntimeError):
    def __init__(self, code: str, message: str, *, metadata: dict[str, Any] | None = None) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.metadata = metadata or {}


def build_server() -> FastMCP[Any]:
    mcp: FastMCP[Any] = FastMCP(name=SERVER_NAME, version=SERVER_VERSION)

    @mcp.tool(
        name="check_rumination",
        description=(
            "Detect whether the user\'s current prompt is a semantic repeat of recent prompts "
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
            "Classify hyperfocus escalation from a caller-supplied chronometric snapshot "
            "into one of (none, gentle, nudge, hard). Stateless; quotes prior_intent verbatim."
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
            result = check_hyperfocus(payload)
        except SessionIdMismatchError as exc:
            raise _ToolError("SESSION_ID_MISMATCH", str(exc)) from exc
        return result.model_dump(exclude_none=True)

    @mcp.tool(
        name="check_sycophancy",
        description=(
            "Detect over-validation in a candidate response or repeated reassurance-seeking "
            "in recent user messages. Returns a counter_prompt the caller MAY surface."
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
            result = check_sycophancy(payload)
        except SycophancyInputMissingError as exc:
            raise _ToolError("INPUT_MISSING", str(exc)) from exc
        return result.model_dump(exclude_none=True)

    return mcp


app: FastMCP[Any] = build_server()


def main() -> None:
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format='{"logger":"%(name)s","level":"%(levelname)s","msg":"%(message)s"}',
    )
    app.run()


if __name__ == "__main__":
    main()
