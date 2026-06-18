# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""FastMCP server registration for the chronometric tools.

The server binds a fresh :class:`SessionState` and :class:`Clock` to the
registered tools. Tests can call :func:`build_server` with their own state and
clock to get a fully isolated server instance.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from fastmcp import FastMCP

from neurodock_mcp_chronometric.clock import Clock, SystemClock
from neurodock_mcp_chronometric.profile import ChronometricProfile, load_profile
from neurodock_mcp_chronometric.state import SessionState
from neurodock_mcp_chronometric.tools.break_request import (
    ThresholdOutOfRangeError,
    request_break_if_needed,
)
from neurodock_mcp_chronometric.tools.idle import idle_status
from neurodock_mcp_chronometric.tools.session import (
    IntentRequiredError,
    IntentTooLongError,
    NoOpenSessionError,
    SummaryTooLongError,
    mark_session_end,
    mark_session_start,
)
from neurodock_mcp_chronometric.tools.time_context import get_time_context

SERVER_NAME = "neurodock-mcp-chronometric"
SERVER_VERSION = "0.1.0"

_LOG = logging.getLogger("neurodock_mcp_chronometric.server")


class _ToolError(RuntimeError):
    """Internal exception type that carries an MCP-friendly error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


def build_server(
    *,
    state: SessionState | None = None,
    clock: Clock | None = None,
    profile: ChronometricProfile | None = None,
) -> FastMCP:
    """Construct a fully wired FastMCP server with all five tools registered.

    All arguments are optional; production callers pass nothing and get a
    :class:`SystemClock`, a fresh :class:`SessionState`, and a freshly loaded
    profile. Tests pass deterministic dependencies.
    """

    effective_state = state if state is not None else SessionState()
    effective_clock: Clock = clock if clock is not None else SystemClock()
    # Load the profile once at construction time so every tool reads a single,
    # consistent snapshot of the chronometric thresholds and consent flag. Tests
    # inject a deterministic profile; production callers pass nothing.
    effective_profile = profile if profile is not None else load_profile()

    mcp: FastMCP[Any] = FastMCP(name=SERVER_NAME, version=SERVER_VERSION)

    @mcp.tool(
        name="get_time_context",
        description=(
            "Return current wall-clock time, day, time since last prompt, "
            "current session length, and a heuristic energy_zone."
        ),
    )
    def _get_time_context() -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "get_time_context"})
        return get_time_context(
            clock=effective_clock, state=effective_state, profile=effective_profile
        ).model_dump(exclude_none=True)

    @mcp.tool(
        name="mark_session_start",
        description=(
            "Open a new work session anchored to a stated intent. Auto-closes "
            "any prior unterminated session and surfaces its metadata."
        ),
    )
    def _mark_session_start(intent: str) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "mark_session_start"})
        try:
            result = mark_session_start(intent=intent, clock=effective_clock, state=effective_state)
        except IntentRequiredError as exc:
            raise _ToolError("INTENT_REQUIRED", str(exc)) from exc
        except IntentTooLongError as exc:
            raise _ToolError("INTENT_TOO_LONG", str(exc)) from exc
        return result.model_dump(exclude_none=False)

    @mcp.tool(
        name="mark_session_end",
        description=(
            "Close the currently open session, optionally attaching a summary. "
            "Closes only the most recent open session; takes no session_id."
        ),
    )
    def _mark_session_end(summary: str | None = None) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "mark_session_end"})
        try:
            result = mark_session_end(summary=summary, clock=effective_clock, state=effective_state)
        except SummaryTooLongError as exc:
            raise _ToolError("SUMMARY_TOO_LONG", str(exc)) from exc
        except NoOpenSessionError as exc:
            raise _ToolError("NO_OPEN_SESSION", str(exc)) from exc
        return result.model_dump(exclude_none=False)

    @mcp.tool(
        name="request_break_if_needed",
        description=(
            "Return a coarse break suggestion when the open session has run "
            "past `threshold_minutes`, or null when no break is warranted."
        ),
    )
    def _request_break_if_needed(threshold_minutes: int) -> dict[str, Any] | None:
        _LOG.info("tool_invoked", extra={"tool": "request_break_if_needed"})
        try:
            result = request_break_if_needed(
                threshold_minutes=threshold_minutes,
                clock=effective_clock,
                state=effective_state,
                profile=effective_profile,
            )
        except ThresholdOutOfRangeError as exc:
            raise _ToolError("THRESHOLD_OUT_OF_RANGE", str(exc)) from exc
        if result is None:
            return None
        # exclude_none drops the additive optional fields (escalation,
        # protected_window_label) when unset; the four legacy fields are always
        # populated so the wire shape is unchanged when no profile windows match.
        return result.model_dump(exclude_none=True)

    @mcp.tool(
        name="idle_status",
        description=(
            "Return OS idle seconds, a coarse hyperfocus_signal, and a consent "
            "flag. CONSENT-GATED via profile.privacy.os_idle_consent."
        ),
    )
    def _idle_status() -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "idle_status"})
        result = idle_status(clock=effective_clock, profile=effective_profile)
        # os_idle_seconds is required by the schema (nullable), so we dump with
        # exclude_none=False to keep it, then drop the genuinely-optional fields
        # (sampled_at, motor_fatigue_aware) when they are unset.
        payload = result.model_dump(exclude_none=False)
        if result.sampled_at is None:
            payload.pop("sampled_at", None)
        if result.motor_fatigue_aware is None:
            payload.pop("motor_fatigue_aware", None)
        return payload

    return mcp


# Module-level "default" server, useful for ``python -m`` invocation and for
# smoke tests that just want to confirm registration succeeds.
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
