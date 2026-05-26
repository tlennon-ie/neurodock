# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Dependency-ordered total sort over decomposed tasks.

Per ADR 0003 §5 cycles are an error (``DEPENDENCY_CYCLE``). Per ADR 0003 §6
``sequence`` is a total order, not just topological: tasks at the same
topological depth still get distinct sequence numbers, broken by a stable
tie-break.

This module returns the order as a list of task ids. The caller is responsible
for assigning ``sequence`` integers and rewriting the task records.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


class DependencyCycleError(RuntimeError):
    """Raised when the candidate decomposition has a cycle."""


class UnknownDependencyError(ValueError):
    """Raised when a task lists a dependency id that is not in the input set."""


@dataclass(frozen=True)
class _Node:
    """Internal record used by :func:`topological_sort`."""

    task_id: str
    estimated_minutes: int
    dependencies: tuple[str, ...]


def topological_sort(
    nodes: Iterable[_Node | tuple[str, int, Iterable[str]]],
) -> list[str]:
    """Return a total order over ``nodes`` honouring dependency edges.

    The tie-break is stable: among tasks whose dependencies are all already
    placed, the next one is the smallest by ``(estimated_minutes, task_id)``.

    Raises :class:`DependencyCycleError` on a cycle, and
    :class:`UnknownDependencyError` if a dependency id is not in the input set.
    """

    materialised: list[_Node] = [
        node if isinstance(node, _Node) else _Node(node[0], node[1], tuple(node[2]))
        for node in nodes
    ]

    by_id: dict[str, _Node] = {n.task_id: n for n in materialised}
    if len(by_id) != len(materialised):
        raise UnknownDependencyError("duplicate task id in dependency input")

    # Validate dependency targets up front so cycle detection cannot mask a
    # typo for a much more confusing error later.
    for node in materialised:
        for dep in node.dependencies:
            if dep not in by_id:
                raise UnknownDependencyError(f"task {node.task_id!r} depends on unknown id {dep!r}")

    # remaining_deps tracks how many of each node's dependencies are not yet
    # placed in the output order.
    remaining_deps: dict[str, int] = {n.task_id: len(n.dependencies) for n in materialised}

    # reverse_edges[dep] is the set of nodes that depend on `dep`.
    reverse_edges: dict[str, list[str]] = {n.task_id: [] for n in materialised}
    for node in materialised:
        for dep in node.dependencies:
            reverse_edges[dep].append(node.task_id)

    placed: list[str] = []
    placed_set: set[str] = set()

    while len(placed) < len(materialised):
        ready_ids = [
            task_id
            for task_id, count in remaining_deps.items()
            if count == 0 and task_id not in placed_set
        ]
        if not ready_ids:
            unplaced = sorted(set(by_id) - placed_set)
            raise DependencyCycleError(f"dependency cycle detected among tasks: {unplaced}")

        ready_ids.sort(key=lambda tid: (by_id[tid].estimated_minutes, tid))
        chosen = ready_ids[0]
        placed.append(chosen)
        placed_set.add(chosen)

        for dependent in reverse_edges[chosen]:
            remaining_deps[dependent] -= 1

    return placed


__all__ = [
    "DependencyCycleError",
    "UnknownDependencyError",
    "_Node",
    "topological_sort",
]
