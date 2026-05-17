"""Elapsed-threshold-with-end-of-day heuristic for check_hyperfocus v0.0.2.

Per ADR 0006 and ETHICS.md commitment 3, changes require clinical-reviewer
sign-off. Auditable specification:

1. No session -> level always "none".
2. Scaled thresholds from hyperfocus_break_minutes (default 90):
   gentle = 60% (54min), nudge = 100% (90min), hard = 133% (120min).
3. Explicit escalation_thresholds override the scaled defaults.
4. When end_of_day_local is set AND now is past it, escalate one rung
   (gentle->nudge, nudge->hard). none and hard are fixed points.
5. time_since_stated_end is ISO 8601 duration from EOD to now.
6. Confidence is a deterministic function of how far past the threshold.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Literal

HEURISTIC_NAME: Literal["elapsed_threshold_with_eod"] = "elapsed_threshold_with_eod"
HEURISTIC_VERSION = "0.2.0"
HEURISTIC_DESCRIPTION = (
    "Compares elapsed_seconds against (gentle, nudge, hard) thresholds scaled "
    "from hyperfocus_break_minutes; when now > end_of_day_local, escalates one step."
)

_GENTLE_RATIO: float = 0.60
_NUDGE_RATIO: float = 1.00
_HARD_RATIO: float = 4.0 / 3.0

HyperfocusLevel = Literal["none", "gentle", "nudge", "hard"]


@dataclass(frozen=True)
class HyperfocusThresholds:
    gentle_seconds: int
    nudge_seconds: int
    hard_seconds: int


@dataclass(frozen=True)
class HyperfocusEvaluation:
    level: HyperfocusLevel
    elapsed_seconds: int
    confidence: float
    past_end_of_day: bool
    time_since_stated_end: timedelta | None
    thresholds: HyperfocusThresholds


def resolve_thresholds(
    *,
    hyperfocus_break_minutes: int,
    explicit_gentle: int | None = None,
    explicit_nudge: int | None = None,
    explicit_hard: int | None = None,
) -> HyperfocusThresholds:
    if (
        explicit_gentle is not None
        and explicit_nudge is not None
        and explicit_hard is not None
    ):
        return HyperfocusThresholds(
            gentle_seconds=explicit_gentle * 60,
            nudge_seconds=explicit_nudge * 60,
            hard_seconds=explicit_hard * 60,
        )
    gentle_minutes = int(round(hyperfocus_break_minutes * _GENTLE_RATIO))
    nudge_minutes = int(round(hyperfocus_break_minutes * _NUDGE_RATIO))
    hard_minutes = int(round(hyperfocus_break_minutes * _HARD_RATIO))
    return HyperfocusThresholds(
        gentle_seconds=gentle_minutes * 60,
        nudge_seconds=nudge_minutes * 60,
        hard_seconds=hard_minutes * 60,
    )


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _parse_end_of_day(end_of_day_local: str) -> time:
    hour_str, minute_str = end_of_day_local.split(":")
    return time(hour=int(hour_str), minute=int(minute_str))


def _now_past_end_of_day(now: datetime, end_of_day_local: str) -> tuple[bool, timedelta | None]:
    eod_time = _parse_end_of_day(end_of_day_local)
    eod_moment = datetime.combine(now.date(), eod_time, tzinfo=now.tzinfo)
    if now <= eod_moment:
        return (False, None)
    return (True, now - eod_moment)


def _classify_elapsed(
    elapsed_seconds: int, thresholds: HyperfocusThresholds
) -> HyperfocusLevel:
    if elapsed_seconds < thresholds.gentle_seconds:
        return "none"
    if elapsed_seconds < thresholds.nudge_seconds:
        return "gentle"
    if elapsed_seconds < thresholds.hard_seconds:
        return "nudge"
    return "hard"


def _escalate(level: HyperfocusLevel) -> HyperfocusLevel:
    if level == "gentle":
        return "nudge"
    if level == "nudge":
        return "hard"
    return level


def _confidence_for_level(
    level: HyperfocusLevel,
    elapsed_seconds: int,
    thresholds: HyperfocusThresholds,
) -> float:
    if level == "none":
        return 0.95
    if level == "gentle":
        distance = elapsed_seconds - thresholds.gentle_seconds
        span = max(thresholds.nudge_seconds - thresholds.gentle_seconds, 1)
        return round(0.55 + 0.3 * min(distance / span, 1.0), 4)
    if level == "nudge":
        distance = elapsed_seconds - thresholds.nudge_seconds
        span = max(thresholds.hard_seconds - thresholds.nudge_seconds, 1)
        return round(0.7 + 0.2 * min(distance / span, 1.0), 4)
    distance = elapsed_seconds - thresholds.hard_seconds
    span = 30 * 60
    return round(0.88 + 0.1 * min(distance / span, 1.0), 4)


def evaluate(
    *,
    open_session_elapsed_seconds: int | None,
    now_iso: str,
    hyperfocus_break_minutes: int,
    end_of_day_local: str | None,
    escalation_thresholds: HyperfocusThresholds | None = None,
) -> HyperfocusEvaluation:
    thresholds = escalation_thresholds or resolve_thresholds(
        hyperfocus_break_minutes=hyperfocus_break_minutes
    )
    if open_session_elapsed_seconds is None:
        return HyperfocusEvaluation(
            level="none",
            elapsed_seconds=0,
            confidence=1.0,
            past_end_of_day=False,
            time_since_stated_end=None,
            thresholds=thresholds,
        )
    now = _parse_iso(now_iso)
    past_eod = False
    delta: timedelta | None = None
    if end_of_day_local is not None:
        past_eod, delta = _now_past_end_of_day(now, end_of_day_local)
    base_level = _classify_elapsed(open_session_elapsed_seconds, thresholds)
    final_level = _escalate(base_level) if past_eod else base_level
    confidence = _confidence_for_level(final_level, open_session_elapsed_seconds, thresholds)
    return HyperfocusEvaluation(
        level=final_level,
        elapsed_seconds=open_session_elapsed_seconds,
        confidence=confidence,
        past_end_of_day=past_eod,
        time_since_stated_end=delta,
        thresholds=thresholds,
    )
