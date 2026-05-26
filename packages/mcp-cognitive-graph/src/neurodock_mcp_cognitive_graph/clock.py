# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Clock abstraction so tools can be tested with frozen time."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol


class Clock(Protocol):
    """A minimal time source. Always returns an aware datetime."""

    def now(self) -> datetime: ...


class SystemClock:
    """Default clock; returns ``datetime.now(timezone.utc)``."""

    def now(self) -> datetime:
        return datetime.now(UTC)


class FixedClock:
    """Test clock; returns the same fixed instant on every call."""

    def __init__(self, fixed_now: datetime) -> None:
        if fixed_now.tzinfo is None:
            raise ValueError("FixedClock requires a tz-aware datetime.")
        self._now = fixed_now

    def now(self) -> datetime:
        return self._now
