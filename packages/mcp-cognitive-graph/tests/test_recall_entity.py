"""Tests for the ``recall_entity`` tool."""

from __future__ import annotations

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.recall_entity import recall_entity
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact


def test_unknown_name_returns_null_entity(memory_storage: InMemoryStorage) -> None:
    result = recall_entity(memory_storage, "Zephyrine Quetzalcoatl")
    assert result.entity is None
    assert result.facts == []
    assert result.related_entities == []
    assert result.resolution.method == "none"
    assert result.resolution.score == 0.0
    assert result.truncated_facts is False


def test_known_entity_returns_full_shape(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Roberto"},
        predicate="decided_in",
        object={"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
        source="msg://slack/C123/p1715683200000100",
        confidence=1.0,
    )
    result = recall_entity(memory_storage, "Roberto")
    assert result.entity is not None
    assert result.entity.type == "person"
    assert result.entity.name == "Roberto"
    assert result.resolution.method == "exact"
    assert result.resolution.score == 1.0
    assert len(result.facts) == 1
    assert result.facts[0].predicate == "decided_in"
    assert len(result.related_entities) == 1
    assert result.related_entities[0].name == "Adopt SQLite + sqlite-vec"
    assert result.related_entities[0].co_occurrence_count == 1


def test_alias_resolution_case_insensitive(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="depends_on",
        object={"type": "concept", "name": "sqlite-vec"},
    )
    # Add an alias by upserting an additional fact under "kipi-system"; then
    # simulate an alias being recorded.
    project_row = memory_storage.find_entity_exact("project", "kipi-system")
    assert project_row is not None
    memory_storage.add_alias(project_row.id, "kipi")

    result = recall_entity(memory_storage, "KIPI")
    assert result.entity is not None
    assert result.entity.name == "kipi-system"
    assert result.resolution.method == "alias"
    assert result.resolution.score >= 0.9


def test_empty_input_raises_required_error(memory_storage: InMemoryStorage) -> None:
    with pytest.raises(ToolError) as exc_info:
        recall_entity(memory_storage, "   ")
    assert exc_info.value.code == "NAME_OR_ALIAS_REQUIRED"


def test_overlong_input_raises_too_long(memory_storage: InMemoryStorage) -> None:
    with pytest.raises(ToolError) as exc_info:
        recall_entity(memory_storage, "x" * 250)
    assert exc_info.value.code == "NAME_OR_ALIAS_TOO_LONG"
