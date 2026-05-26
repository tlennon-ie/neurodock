# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Fuzzy rung of the recall_entity resolution cascade.

These tests verify the third rung only (rapidfuzz WRatio against name +
aliases). The embedding rung is opted out via the env fixture so the fuzzy
rung is exercised in isolation.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.resolution import (
    EMBEDDING_THRESHOLD,
    FUZZY_THRESHOLD,
    resolve,
)
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact


@pytest.fixture(autouse=True)
def _disable_embeddings() -> Iterator[None]:
    """Force the embedding rung off so we test only the fuzzy rung."""
    prev = os.environ.get("NEURODOCK_GRAPH_DISABLE_EMBEDDINGS")
    os.environ["NEURODOCK_GRAPH_DISABLE_EMBEDDINGS"] = "1"
    try:
        yield
    finally:
        if prev is None:
            del os.environ["NEURODOCK_GRAPH_DISABLE_EMBEDDINGS"]
        else:
            os.environ["NEURODOCK_GRAPH_DISABLE_EMBEDDINGS"] = prev


def _seed_roberto(storage: InMemoryStorage, clock: FixedClock) -> None:
    record_fact(
        storage,
        clock,
        subject={"type": "person", "name": "Roberto"},
        predicate="tagged",
        object={"literal": "engineer"},
    )


def test_fuzzy_typo_on_name_resolves(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """A one-letter typo on the stored name resolves via the fuzzy rung."""
    _seed_roberto(memory_storage, fixed_clock)
    result = resolve(memory_storage, "Robrto")
    assert result.entity is not None
    assert result.entity.name == "Roberto"
    assert result.method == "fuzzy"
    assert result.score >= FUZZY_THRESHOLD / 100.0
    assert result.score < 1.0  # not an exact hit


def test_fuzzy_typo_on_alias_resolves(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """A typo on a recorded alias also resolves via the fuzzy rung."""
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="tagged",
        object={"literal": "core"},
    )
    project = memory_storage.find_entity_exact("project", "kipi-system")
    assert project is not None
    memory_storage.add_alias(project.id, "kipi-sys")

    result = resolve(memory_storage, "kpi-sys")  # 1-edit on "kipi-sys" alias
    assert result.entity is not None
    assert result.entity.name == "kipi-system"
    assert result.method == "fuzzy"


def test_below_threshold_returns_none(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """An input too dissimilar from any stored surface returns no match."""
    _seed_roberto(memory_storage, fixed_clock)
    result = resolve(memory_storage, "ZephyrineQuetzalcoatl")
    assert result.entity is None
    assert result.method == "none"
    assert result.score == 0.0


def test_fuzzy_does_not_supersede_exact(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """If a stored name matches exactly, the cascade returns 'exact' even
    when another entity is fuzzy-close."""
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Roberto"},
        predicate="tagged",
        object={"literal": "team"},
    )
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Robrto"},  # near-miss spelling
        predicate="tagged",
        object={"literal": "other-team"},
    )
    result = resolve(memory_storage, "Roberto")
    assert result.entity is not None
    assert result.entity.name == "Roberto"
    assert result.method == "exact"
    assert result.score == 1.0


def test_threshold_constant_is_conservative() -> None:
    """ADR 0002 open question 1 -- guard against accidental loosening."""
    assert FUZZY_THRESHOLD >= 70
    assert EMBEDDING_THRESHOLD >= 0.75
