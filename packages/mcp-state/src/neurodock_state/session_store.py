# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user session-state contract (ADR 0010 Phase B — definition only).

The chronometric server tracks an open "session" (a span of focused work). To
make that state per-user on the hosted/BYOS path, this module defines the
:class:`SessionStore` protocol it will eventually sit behind. Nothing is wired to
chronometric yet — Phase B ships the contract plus :class:`InMemorySessionStore`,
a reference implementation used by tests to prove per-user isolation.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from typing import Protocol, runtime_checkable

from neurodock_state.identity import UserKey


@dataclass(frozen=True)
class Session:
    """A single tracked work session for one user.

    Immutable: lifecycle transitions (touch/close) return a new instance rather
    than mutating in place, per the project's immutability convention.
    """

    session_id: str
    user_key: str
    intent: str
    started_at: datetime
    last_touched_at: datetime
    ended_at: datetime | None = None

    @property
    def is_open(self) -> bool:
        """True while the session has not been closed."""
        return self.ended_at is None


@runtime_checkable
class SessionStore(Protocol):
    """The contract a per-user session backing must satisfy.

    Implementations isolate sessions per :class:`UserKey`: one user can never
    observe or close another user's session.
    """

    def open_session(
        self,
        user: UserKey,
        session_id: str,
        intent: str,
        *,
        now: datetime,
    ) -> Session:
        """Open (or replace the current) session for ``user`` and return it."""
        ...

    def current_session(self, user: UserKey) -> Session | None:
        """Return ``user``'s open session, or ``None`` if none is open."""
        ...

    def touch_session(self, user: UserKey, *, now: datetime) -> Session | None:
        """Bump the open session's ``last_touched_at``; return it (or ``None``)."""
        ...

    def close_session(self, user: UserKey, *, now: datetime) -> Session | None:
        """Close ``user``'s open session; return the closed session (or ``None``)."""
        ...


class InMemorySessionStore:
    """Dict-backed reference :class:`SessionStore`. Per-user, no persistence."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def open_session(
        self,
        user: UserKey,
        session_id: str,
        intent: str,
        *,
        now: datetime,
    ) -> Session:
        session = Session(
            session_id=session_id,
            user_key=user.storage_key,
            intent=intent,
            started_at=now,
            last_touched_at=now,
        )
        self._sessions[user.storage_key] = session
        return session

    def current_session(self, user: UserKey) -> Session | None:
        session = self._sessions.get(user.storage_key)
        if session is None or not session.is_open:
            return None
        return session

    def touch_session(self, user: UserKey, *, now: datetime) -> Session | None:
        session = self.current_session(user)
        if session is None:
            return None
        touched = replace(session, last_touched_at=now)
        self._sessions[user.storage_key] = touched
        return touched

    def close_session(self, user: UserKey, *, now: datetime) -> Session | None:
        session = self.current_session(user)
        if session is None:
            return None
        closed = replace(session, last_touched_at=now, ended_at=now)
        self._sessions[user.storage_key] = closed
        return closed
