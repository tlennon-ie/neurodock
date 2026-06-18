# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Pure resolution helpers for the R5 chronometric profile fields.

These functions are deliberately small and side-effect-free so the heuristics
are auditable and unit-testable without a clock dependency beyond the tz-aware
``datetime`` passed in. They map the declarative profile fields onto the
"effective for today / right now" values the tools need:

* :func:`resolve_end_of_day_local` and :func:`resolve_hyperfocus_break_minutes`
  apply today's ``weekday_overrides`` entry (if any) on top of the base value.
* :func:`matched_protected_window` returns the first ``protected_windows`` entry
  that contains the current local time, handling the midnight-wrap case where a
  window's ``end`` precedes its ``start``.
"""

from __future__ import annotations

from datetime import datetime

from neurodock_mcp_chronometric.profile import (
    WEEKDAY_KEYS,
    ChronometricProfile,
    ProtectedWindow,
)


def _today_override_key(now: datetime) -> str:
    """Return the lowercase weekday key for ``now`` (Monday == index 0)."""

    return WEEKDAY_KEYS[now.weekday()]


def resolve_end_of_day_local(profile: ChronometricProfile, now: datetime) -> str | None:
    """Return today's effective ``end_of_day_local`` (HH:MM), or ``None``.

    Today's ``weekday_overrides`` entry, when it sets ``end_of_day_local``,
    re-anchors the base value. An absent override (or an override that does not
    set this field) inherits the top-level ``end_of_day_local``.
    """

    override = profile.weekday_overrides.get(_today_override_key(now))
    if override is not None and override.end_of_day_local is not None:
        return override.end_of_day_local
    return profile.end_of_day_local


def resolve_hyperfocus_break_minutes(profile: ChronometricProfile, now: datetime) -> int | None:
    """Return today's effective ``hyperfocus_break_minutes``, or ``None``.

    Today's ``weekday_overrides`` entry, when it sets ``hyperfocus_break_minutes``,
    re-anchors the base value. An absent override inherits the top-level value;
    ``None`` means the profile declared nothing and the caller should apply its
    own default.
    """

    override = profile.weekday_overrides.get(_today_override_key(now))
    if override is not None and override.hyperfocus_break_minutes is not None:
        return override.hyperfocus_break_minutes
    return profile.hyperfocus_break_minutes


def _minute_of_day(hhmm: str) -> int:
    # Precondition: ``hhmm`` is pre-validated by the profile loader's HH:MM regex
    # (``_HHMM_RE``), so the split + int parse below can never raise here.
    hour_str, minute_str = hhmm.split(":")
    return int(hour_str) * 60 + int(minute_str)


def _window_contains(window: ProtectedWindow, minute_of_day: int) -> bool:
    """Return whether ``minute_of_day`` falls inside ``window``.

    The window is half-open: ``start`` is inclusive, ``end`` is exclusive, so
    adjacent windows never double-match. When ``end`` < ``start`` the window
    wraps past midnight, so the inside test becomes the union of
    ``[start, 1440)`` and ``[0, end)``.
    """

    start = _minute_of_day(window.start)
    end = _minute_of_day(window.end)

    if start == end:
        # Degenerate zero-length window: matches nothing.
        return False
    if start < end:
        return start <= minute_of_day < end
    # Wrap past midnight.
    return minute_of_day >= start or minute_of_day < end


def matched_protected_window(profile: ChronometricProfile, now: datetime) -> ProtectedWindow | None:
    """Return the first protected window containing ``now``'s local time, or ``None``.

    Windows are evaluated in declaration order, so an earlier window in the
    profile wins when ranges overlap.

    Local-wall-clock contract: protected-window ``start``/``end`` are the user's
    declared LOCAL HH:MM, so ``now`` is normalised with ``.astimezone()`` before
    its minute-of-day is read. The result is therefore independent of which tz
    offset the caller's ``datetime`` happens to carry (e.g. a UTC-tz clock in a
    container compares the user's local time, not raw UTC hours).
    """

    local = now.astimezone()
    minute_of_day = local.hour * 60 + local.minute
    for window in profile.protected_windows:
        if _window_contains(window, minute_of_day):
            return window
    return None
