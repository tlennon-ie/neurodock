"""Tests for the ``record_fact`` tool."""

from __future__ import annotations

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact


def test_stores_and_returns_canonical_id(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    result = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Roberto"},
        predicate="decided_in",
        object={"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
        source="msg://slack/C123/p1715683200000100",
        confidence=1.0,
    )
    assert result.fact_id.startswith("fact_")
    assert result.predicate == "decided_in"
    assert result.deduplicated is False
    auto_names = {e.name for e in result.auto_created_entities}
    assert "Roberto" in auto_names
    assert "Adopt SQLite + sqlite-vec" in auto_names


def test_unknown_predicate_raises_vocabulary_error(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject={"type": "person", "name": "Roberto"},
            predicate="hugs",
            object={"type": "person", "name": "Priya"},
        )
    assert exc_info.value.code == "PREDICATE_NOT_IN_VOCABULARY"


def test_duplicate_returns_same_id_with_deduplicated_true(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    first = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="depends_on",
        object={"type": "concept", "name": "sqlite-vec"},
    )
    second = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="depends_on",
        object={"type": "concept", "name": "sqlite-vec"},
        source="https://github.com/assafkip/kipi-system",
        confidence=0.95,
    )
    assert second.fact_id == first.fact_id
    assert second.deduplicated is True
    # Auto-creation should be empty on the second call.
    assert second.auto_created_entities == []


def test_literal_object_is_accepted(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    result = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="tagged",
        object={"literal": "external-memory"},
        confidence=0.8,
    )
    assert result.deduplicated is False
    # object should be a literal payload, not an entity payload.
    assert result.object.model_dump() == {"literal": "external-memory"}


def test_invalid_confidence_raises(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject={"type": "person", "name": "Roberto"},
            predicate="reports_to",
            object={"type": "person", "name": "Priya"},
            confidence=2.0,
        )
    assert exc_info.value.code == "CONFIDENCE_OUT_OF_RANGE"
