# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the ``recall_decisions`` tool."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.recall_decisions import recall_decisions
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact


def test_unknown_project_returns_empty_decisions(memory_storage: InMemoryStorage) -> None:
    result = recall_decisions(memory_storage, "Zephyrine Quetzalcoatl Project")
    assert result.project is None
    assert result.decisions == []
    assert result.truncated is False


def test_decisions_ordered_date_desc(memory_storage: InMemoryStorage) -> None:
    # Set up two decisions on two different dates.
    early_clock = FixedClock(datetime(2026, 4, 22, 10, 0, tzinfo=UTC))
    late_clock = FixedClock(datetime(2026, 5, 14, 10, 0, tzinfo=UTC))

    record_fact(
        memory_storage,
        early_clock,
        subject={"type": "project", "name": "neurodock"},
        predicate="decided_in",
        object={"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
    )
    record_fact(
        memory_storage,
        late_clock,
        subject={"type": "project", "name": "neurodock"},
        predicate="decided_in",
        object={"type": "decision", "name": "Ship rumination detector first"},
    )

    result = recall_decisions(memory_storage, "neurodock")
    assert result.project is not None
    assert result.project.name == "neurodock"
    assert len(result.decisions) == 2
    assert result.decisions[0].name == "Ship rumination detector first"
    assert result.decisions[1].name == "Adopt SQLite + sqlite-vec"
    assert result.decisions[0].decided_on > result.decisions[1].decided_on


def test_since_filter_respected(memory_storage: InMemoryStorage) -> None:
    early_clock = FixedClock(datetime(2026, 4, 22, 10, 0, tzinfo=UTC))
    late_clock = FixedClock(datetime(2026, 5, 14, 10, 0, tzinfo=UTC))

    record_fact(
        memory_storage,
        early_clock,
        subject={"type": "project", "name": "neurodock"},
        predicate="decided_in",
        object={"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
    )
    record_fact(
        memory_storage,
        late_clock,
        subject={"type": "project", "name": "neurodock"},
        predicate="decided_in",
        object={"type": "decision", "name": "Ship rumination detector first"},
    )

    result = recall_decisions(memory_storage, "neurodock", since="2026-05-01")
    assert len(result.decisions) == 1
    assert result.decisions[0].name == "Ship rumination detector first"
    assert result.since is not None
    assert result.since.isoformat() == "2026-05-01"


def test_decision_via_belongs_to_with_person_attribution_surfaces(
    memory_storage: InMemoryStorage,
) -> None:
    # The shape Claude naturally records: the decision BELONGS_TO the project
    # (not project decided_in decision), and a person is credited via decided_in
    # on the decision. Both read-paths must surface it (regression for the
    # 2026-06-10 retest "decisions don't surface" bug).
    clock = FixedClock(datetime(2026, 5, 14, 10, 0, tzinfo=UTC))
    record_fact(
        memory_storage,
        clock,
        subject={"type": "decision", "name": "Adopt hosted Turso storage"},
        predicate="belongs_to",
        object={"type": "project", "name": "neurodock"},
    )
    record_fact(
        memory_storage,
        clock,
        subject={"type": "person", "name": "Thomas"},
        predicate="decided_in",
        object={"type": "decision", "name": "Adopt hosted Turso storage"},
    )

    result = recall_decisions(memory_storage, "neurodock")
    assert result.project is not None
    assert result.project.name == "neurodock"
    assert len(result.decisions) == 1
    decision = result.decisions[0]
    assert decision.name == "Adopt hosted Turso storage"
    assert [a.name for a in decision.decided_by] == ["Thomas"]


def test_decision_via_belongs_to_only_surfaces_without_attributor(
    memory_storage: InMemoryStorage,
) -> None:
    # A decision linked to the project ONLY via belongs_to (no person credited)
    # still surfaces, with an empty decided_by.
    clock = FixedClock(datetime(2026, 5, 14, 10, 0, tzinfo=UTC))
    record_fact(
        memory_storage,
        clock,
        subject={"type": "decision", "name": "License under AGPL-3.0"},
        predicate="belongs_to",
        object={"type": "project", "name": "neurodock"},
    )

    result = recall_decisions(memory_storage, "neurodock")
    assert len(result.decisions) == 1
    assert result.decisions[0].name == "License under AGPL-3.0"
    assert result.decisions[0].decided_by == []


def test_invalid_since_raises(memory_storage: InMemoryStorage) -> None:
    with pytest.raises(ToolError) as exc_info:
        recall_decisions(memory_storage, "neurodock", since="not-a-date")
    assert exc_info.value.code == "SINCE_INVALID"


def test_empty_project_raises(memory_storage: InMemoryStorage) -> None:
    with pytest.raises(ToolError) as exc_info:
        recall_decisions(memory_storage, "")
    assert exc_info.value.code == "PROJECT_REQUIRED"
