# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for the topological sort + tie-break."""

from __future__ import annotations

import pytest
from neurodock_mcp_task_fractionator.topological import (
    DependencyCycleError,
    UnknownDependencyError,
    _Node,
    topological_sort,
)


def test_linear_chain_orders_in_dependency_order() -> None:
    """``a -> b -> c`` returns ``[a, b, c]`` regardless of input order."""

    a = _Node("a", 30, ())
    b = _Node("b", 30, ("a",))
    c = _Node("c", 30, ("b",))

    assert topological_sort([c, a, b]) == ["a", "b", "c"]


def test_parallel_nodes_break_ties_by_estimated_minutes_then_id() -> None:
    """At equal depth, fewer-minute task wins; equal minutes break by id."""

    short = _Node("zzz", 10, ())
    medium = _Node("mid", 20, ())
    long_a = _Node("aaa", 30, ())
    long_b = _Node("bbb", 30, ())

    # Insertion order intentionally jumbled.
    ordered = topological_sort([long_b, medium, long_a, short])
    assert ordered == ["zzz", "mid", "aaa", "bbb"]


def test_cycle_raises_dependency_cycle_error() -> None:
    """Any cycle returns DependencyCycleError."""

    a = _Node("a", 30, ("b",))
    b = _Node("b", 30, ("a",))

    with pytest.raises(DependencyCycleError):
        topological_sort([a, b])


def test_unknown_dependency_raises_typed_error() -> None:
    """Dependency on a non-existent id surfaces UnknownDependencyError."""

    a = _Node("a", 30, ("missing",))
    with pytest.raises(UnknownDependencyError):
        topological_sort([a])
