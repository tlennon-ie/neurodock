# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the ``weekly_rollup`` tool."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact
from neurodock_mcp_cognitive_graph.tools.weekly_rollup import weekly_rollup


def test_empty_graph_returns_empty_rollup(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    result = weekly_rollup(memory_storage, fixed_clock)
    assert result.project is None
    assert result.decisions == []
    assert result.blockers == []
    assert result.next_actions == []
    assert "0 decisions recorded" in result.summary
    # Period is the trailing seven days ending on the clock's date.
    assert result.period.end.isoformat() == "2026-05-15"
    assert result.period.start.isoformat() == "2026-05-09"


def test_aggregates_decisions_and_blockers(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    in_window_clock = FixedClock(datetime(2026, 5, 12, 10, 0, tzinfo=UTC))

    record_fact(
        memory_storage,
        in_window_clock,
        subject={"type": "person", "name": "Priya"},
        predicate="decided_in",
        object={"type": "decision", "name": "Ship rumination detector first"},
        source="https://github.com/neurodock/neurodock/issues/118",
    )
    record_fact(
        memory_storage,
        in_window_clock,
        subject={"type": "project", "name": "neurodock"},
        predicate="decided_in",
        object={"type": "decision", "name": "Ship rumination detector first"},
    )
    record_fact(
        memory_storage,
        in_window_clock,
        subject={"type": "project", "name": "neurodock"},
        predicate="blocked_by",
        object={"literal": "awaiting clinical advisor confirmation"},
        confidence=0.9,
    )

    result = weekly_rollup(memory_storage, fixed_clock)
    assert len(result.decisions) == 1
    assert result.decisions[0].name == "Ship rumination detector first"
    assert len(result.blockers) == 1
    assert any("Resolve blocker" in a for a in result.next_actions)
    assert any("Follow up on decision" in a for a in result.next_actions)


def test_respects_project_filter(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    in_window_clock = FixedClock(datetime(2026, 5, 12, 10, 0, tzinfo=UTC))

    # A decision on a DIFFERENT project — must be excluded by the project filter.
    record_fact(
        memory_storage,
        in_window_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="decided_in",
        object={"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
    )
    # A decision on the queried project.
    record_fact(
        memory_storage,
        in_window_clock,
        subject={"type": "project", "name": "neurodock"},
        predicate="decided_in",
        object={"type": "decision", "name": "Ship rumination detector first"},
    )

    result = weekly_rollup(memory_storage, fixed_clock, project="neurodock")
    assert result.project == "neurodock"
    assert len(result.decisions) == 1
    assert result.decisions[0].name == "Ship rumination detector first"


def test_unknown_project_raises_project_not_found(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    with pytest.raises(ToolError) as exc_info:
        weekly_rollup(memory_storage, fixed_clock, project="Zephyrine Quetzalcoatl")
    assert exc_info.value.code == "PROJECT_NOT_FOUND"
