"""``mark_session_start`` and ``mark_session_end`` implementations."""

from __future__ import annotations

from neurodock_mcp_chronometric.clock import Clock
from neurodock_mcp_chronometric.duration import format_duration
from neurodock_mcp_chronometric.schemas import (
    AutoClosedPriorSession,
    MarkSessionEndOutput,
    MarkSessionStartOutput,
)
from neurodock_mcp_chronometric.state import SessionState


class IntentRequiredError(ValueError):
    """Raised when ``intent`` is missing or empty after trimming."""


class IntentTooLongError(ValueError):
    """Raised when ``intent`` exceeds the 500-character limit."""


class SummaryTooLongError(ValueError):
    """Raised when ``summary`` exceeds the 1000-character limit."""


class NoOpenSessionError(RuntimeError):
    """Raised when ``mark_session_end`` is called without an open session."""


def mark_session_start(*, intent: str, clock: Clock, state: SessionState) -> MarkSessionStartOutput:
    """Open a new session. Auto-closes any prior open session.

    Honours ADR 0001 open question 3's default policy: auto-close, and surface
    the prior session metadata in the response so skills can say "you didn't
    close your last session".
    """

    trimmed = intent.strip() if isinstance(intent, str) else ""
    if not trimmed:
        raise IntentRequiredError("intent must be a non-empty string")
    if len(trimmed) > 500:
        raise IntentTooLongError("intent exceeds 500 characters")

    now = clock.now()
    prior = state.auto_close_prior(now=now)
    auto_closed: AutoClosedPriorSession | None = None
    if prior is not None:
        auto_closed = AutoClosedPriorSession(
            prior_session_id=prior.session_id,
            closed_at=now.isoformat(),
        )

    new_session = state.open_session(intent=trimmed, now=now)
    return MarkSessionStartOutput(
        session_id=new_session.session_id,
        started_at=new_session.started_at.isoformat(),
        intent=new_session.intent,
        auto_closed_prior_session=auto_closed,
    )


def mark_session_end(
    *, summary: str | None, clock: Clock, state: SessionState
) -> MarkSessionEndOutput:
    """Close the open session, optionally attaching a summary."""

    if summary is not None and len(summary) > 1000:
        raise SummaryTooLongError("summary exceeds 1000 characters")

    if summary is not None and summary == "":
        # Reject the empty-string case the same way the schema's minLength does.
        summary = None

    now = clock.now()
    closed = state.close_current(now=now, summary=summary)
    if closed is None:
        raise NoOpenSessionError("no open session to close")

    duration = closed.ended_at - closed.started_at
    return MarkSessionEndOutput(
        session_id=closed.session_id,
        started_at=closed.started_at.isoformat(),
        ended_at=closed.ended_at.isoformat(),
        duration=format_duration(duration),
        intent=closed.intent,
        summary=closed.summary,
    )
