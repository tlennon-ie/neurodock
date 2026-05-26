# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ISO 8601 ``time_budget`` parsing."""

from __future__ import annotations

import pytest
from neurodock_mcp_task_fractionator.duration import (
    TimeBudgetUnparseableError,
    parse_time_budget,
)


def test_parses_hours() -> None:
    parsed = parse_time_budget("PT4H")
    assert parsed.minutes_ceiling == 240
    assert parsed.has_days_only is False


def test_parses_combined_hours_and_minutes() -> None:
    parsed = parse_time_budget("PT2H30M")
    assert parsed.minutes_ceiling == 150
    assert parsed.has_days_only is False


def test_parses_minutes_only() -> None:
    parsed = parse_time_budget("PT30M")
    assert parsed.minutes_ceiling == 30


def test_days_apply_working_block_convention() -> None:
    """P3D maps to 3 working blocks of the default 4-hour block (720 min)."""

    parsed = parse_time_budget("P3D")
    assert parsed.has_days_only is True
    assert parsed.minutes_ceiling == 3 * 4 * 60


def test_rejects_malformed_input() -> None:
    with pytest.raises(TimeBudgetUnparseableError):
        parse_time_budget("not-a-duration")


def test_rejects_empty_string() -> None:
    with pytest.raises(TimeBudgetUnparseableError):
        parse_time_budget("")


def test_rejects_bare_p() -> None:
    """``P`` alone is rejected by the regex's look-ahead."""

    with pytest.raises(TimeBudgetUnparseableError):
        parse_time_budget("P")
