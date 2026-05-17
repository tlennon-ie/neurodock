"""ISO 8601 duration parsing for ``time_budget``.

Per ADR 0003 §3 the input format is strict: the same regex used by
``mcp-chronometric``. Unparseable input is surfaced as a structured error,
never silently treated as unbounded.

A ``time_budget`` is converted to a ceiling expressed in minutes for budget
feasibility checks in :mod:`decomposer`. Per ADR §3, ``P3D`` means three working
blocks of profile-declared length (default 4 hours each) — *not* 72 consecutive
hours of work.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Same regex as the JSON Schema, with the same look-ahead semantics. Pydantic's
# Rust regex would reject ``(?!$)`` so we parse with Python re directly.
_DURATION_RE = re.compile(
    r"^P(?!$)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?"
    r"(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$"
)

# Per ADR §3, ``P3D`` means three working blocks. Working block defaults to
# four hours when no profile override is provided. This is server-internal —
# the contract surface is the duration *format*, not its conversion factor.
DEFAULT_WORKING_BLOCK_MINUTES: int = 4 * 60

# Conservative calendar approximations for the rare Y/M case. We never store
# wall-clock dates; we only need a minute ceiling for feasibility checks. A
# month is 30 days; a year is 365 days. Documented and acceptable for v0.0.1.
_MINUTES_PER_DAY: int = 24 * 60
_DAYS_PER_MONTH: int = 30
_DAYS_PER_YEAR: int = 365


class TimeBudgetUnparseableError(ValueError):
    """Raised when ``time_budget`` does not match the ISO 8601 duration regex."""


@dataclass(frozen=True)
class ParsedTimeBudget:
    """Parsed ``time_budget`` expressed in raw fields and minute ceiling.

    ``minutes_ceiling`` is what the decomposer compares against the sum of
    task ``estimated_minutes`` values. ``has_days_only`` records whether the
    caller expressed the budget purely in days/weeks (so we apply the working
    block convention from ADR §3 rather than treating it as continuous hours).
    """

    raw: str
    minutes_ceiling: int
    has_days_only: bool


def parse_time_budget(
    value: str,
    *,
    working_block_minutes: int = DEFAULT_WORKING_BLOCK_MINUTES,
) -> ParsedTimeBudget:
    """Parse a ``time_budget`` string into a minute ceiling.

    Empty strings and ``None`` are rejected upstream by the schema; this
    function rejects them too so callers cannot accidentally pass them in.
    """

    if not isinstance(value, str) or not value:
        raise TimeBudgetUnparseableError("time_budget must be a non-empty ISO 8601 duration")

    match = _DURATION_RE.match(value)
    if match is None:
        raise TimeBudgetUnparseableError(f"time_budget not a valid ISO 8601 duration: {value!r}")

    years_s, months_s, weeks_s, days_s, hours_s, minutes_s, seconds_s = match.groups()

    years = int(years_s) if years_s else 0
    months = int(months_s) if months_s else 0
    weeks = int(weeks_s) if weeks_s else 0
    days = int(days_s) if days_s else 0
    hours = int(hours_s) if hours_s else 0
    minutes = int(minutes_s) if minutes_s else 0
    seconds = float(seconds_s) if seconds_s else 0.0

    has_time_part = bool(hours_s or minutes_s or seconds_s)
    has_days_or_calendar = bool(years_s or months_s or weeks_s or days_s)
    has_days_only = has_days_or_calendar and not has_time_part

    if has_days_only:
        # Days-style budgets are working blocks per ADR §3.
        total_working_blocks = years * _DAYS_PER_YEAR + months * _DAYS_PER_MONTH
        total_working_blocks += weeks * 7 + days
        minutes_ceiling = total_working_blocks * working_block_minutes
    else:
        # Mixed or time-only budgets are continuous minutes.
        minutes_ceiling = years * _DAYS_PER_YEAR * _MINUTES_PER_DAY
        minutes_ceiling += months * _DAYS_PER_MONTH * _MINUTES_PER_DAY
        minutes_ceiling += weeks * 7 * _MINUTES_PER_DAY
        minutes_ceiling += days * _MINUTES_PER_DAY
        minutes_ceiling += hours * 60
        minutes_ceiling += minutes
        minutes_ceiling += int(seconds // 60)

    return ParsedTimeBudget(raw=value, minutes_ceiling=minutes_ceiling, has_days_only=has_days_only)
