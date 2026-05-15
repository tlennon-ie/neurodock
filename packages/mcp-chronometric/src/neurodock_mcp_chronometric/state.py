"""In-memory session state.

v0.0.1 keeps everything in memory. The ADR mandates SQLite persistence before
v0.1.0 ships; that work is tracked under the SQLite TODO marker below.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime

# TODO: persist to SQLite. See ADR 0001 §"Notes for mcp-server-builder".


@dataclass(frozen=True)
class OpenSession:
    """A session that has been opened with ``mark_session_start`` and not yet closed."""

    session_id: str
    started_at: datetime
    intent: str


@dataclass(frozen=True)
class ClosedSession:
    """A session that has been closed by ``mark_session_end``."""

    session_id: str
    started_at: datetime
    ended_at: datetime
    intent: str
    summary: str | None


@dataclass
class SessionState:
    """Server-local mutable state for the chronometric server.

    Holds the currently-open session (if any) and the timestamp of the most
    recent tool invocation, used to compute ``time_since_last_prompt``.

    Instances are independent so tests can spin up isolated state per test.
    """

    _open: OpenSession | None = field(default=None)
    _last_prompt_at: datetime | None = field(default=None)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    # ------------------------------------------------------------------ session

    def open_session(self, *, intent: str, now: datetime) -> OpenSession:
        """Create a new open session, replacing any existing one.

        Returns the newly-opened session. If a prior open session existed it is
        discarded by this call — callers that need the prior session metadata
        should read ``current_open()`` first.
        """

        with self._lock:
            new_session = OpenSession(
                session_id=_generate_session_id(),
                started_at=now,
                intent=intent,
            )
            self._open = new_session
            self._last_prompt_at = now
            return new_session

    def auto_close_prior(self, *, now: datetime) -> OpenSession | None:
        """Close any currently-open session and return it.

        Returns ``None`` if no session was open. Implements the "auto-close on
        new session start" policy from ADR 0001 open question 3.
        """

        with self._lock:
            prior = self._open
            self._open = None
            return prior

    def close_current(
        self,
        *,
        now: datetime,
        summary: str | None,
    ) -> ClosedSession | None:
        """Close the currently open session.

        Returns ``None`` if no session is open so callers can surface the
        documented ``NO_OPEN_SESSION`` error.
        """

        with self._lock:
            current = self._open
            if current is None:
                return None
            closed = ClosedSession(
                session_id=current.session_id,
                started_at=current.started_at,
                ended_at=now,
                intent=current.intent,
                summary=summary,
            )
            self._open = None
            self._last_prompt_at = now
            return closed

    def current_open(self) -> OpenSession | None:
        with self._lock:
            return self._open

    # --------------------------------------------------------------- last prompt

    def touch_prompt(self, now: datetime) -> datetime | None:
        """Record that a prompt occurred at ``now``.

        Returns the *previous* last-prompt timestamp so the caller can compute
        ``time_since_last_prompt`` before the update.
        """

        with self._lock:
            previous = self._last_prompt_at
            self._last_prompt_at = now
            return previous

    def last_prompt_at(self) -> datetime | None:
        with self._lock:
            return self._last_prompt_at


def _generate_session_id() -> str:
    """Return a fresh UUIDv4 string."""
    return str(uuid.uuid4())
