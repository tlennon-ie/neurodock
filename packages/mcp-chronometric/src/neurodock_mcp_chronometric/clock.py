# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Clock abstraction so every time read is testable.

All other modules MUST read time through a :class:`Clock` instance instead of
calling ``datetime.now()`` directly. Tests inject a :class:`FrozenClock` so
results are deterministic.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol


class Clock(Protocol):
    """Protocol for any source of the current wall-clock time.

    Implementations MUST return timezone-aware ``datetime`` instances.
    """

    def now(self) -> datetime:
        """Return the current wall-clock time as a tz-aware ``datetime``."""
        ...


class SystemClock:
    """Reads the actual system clock.

    Always returns timezone-aware ``datetime`` in the local timezone.
    """

    def now(self) -> datetime:
        return datetime.now().astimezone()


class FrozenClock:
    """Freezable clock for tests.

    Time advances only when :meth:`advance` is called.
    """

    def __init__(self, initial: datetime) -> None:
        if initial.tzinfo is None:
            raise ValueError("FrozenClock requires a tz-aware datetime")
        self._current = initial

    def now(self) -> datetime:
        return self._current

    def advance(self, seconds: float) -> None:
        from datetime import timedelta

        self._current = self._current + timedelta(seconds=seconds)

    def set_to(self, value: datetime) -> None:
        if value.tzinfo is None:
            raise ValueError("FrozenClock.set_to requires a tz-aware datetime")
        self._current = value


def utc_now() -> datetime:
    """Convenience helper for callers that need a UTC anchor."""
    return datetime.now(tz=UTC)
