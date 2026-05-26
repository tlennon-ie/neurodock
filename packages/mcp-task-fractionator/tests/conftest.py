# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Shared fixtures for the task fractionator tests.

Tests get a fresh, isolated source per case. UUIDs are frozen via an iterator
so failure messages are stable across runs.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from neurodock_mcp_task_fractionator.sources import InMemoryPendingTaskSource
from neurodock_mcp_task_fractionator.types import Task


def _uuid_iter(prefix: int = 1) -> Iterator[str]:
    """Yield syntactically valid UUIDv4 strings deterministically.

    The fourth field starts with ``4``; the fifth field starts with ``8`` —
    the two version-and-variant nibbles required by the schema regex.
    """

    counter = 0
    while True:
        counter += 1
        seg1 = f"{prefix:08x}"
        seg2 = f"{counter:04x}"
        # Force version 4 and variant 8 (the regex requires [89ab]).
        seg3 = f"4{counter:03x}"
        seg4 = f"8{counter:03x}"
        seg5 = f"{counter:012x}"
        yield f"{seg1}-{seg2}-{seg3}-{seg4}-{seg5}"


@pytest.fixture
def uuid_factory() -> Any:
    """Return a callable producing deterministic UUIDv4 strings."""

    gen = _uuid_iter()

    def _factory() -> str:
        return next(gen)

    return _factory


@pytest.fixture
def in_memory_source() -> InMemoryPendingTaskSource:
    return InMemoryPendingTaskSource()


@pytest.fixture
def sample_tasks(uuid_factory: Any) -> list[Task]:
    """Build a small linear pending-tasks list for ``next_one`` tests."""

    first_id = uuid_factory()
    second_id = uuid_factory()
    third_id = uuid_factory()
    return [
        Task(
            id=first_id,
            title="Clarify scope of the rfc",
            description="Define what done means for this RFC.",
            estimated_minutes=15,
            acceptance_criteria=["Scope paragraph committed"],
            dependencies=[],
            sequence=1,
            tags=["scoping"],
        ),
        Task(
            id=second_id,
            title="Draft the rfc",
            description="Write the first draft of the RFC.",
            estimated_minutes=40,
            acceptance_criteria=["First draft committed to the repo"],
            dependencies=[first_id],
            sequence=2,
            tags=["draft"],
        ),
        Task(
            id=third_id,
            title="Confirm the rfc is done",
            description="Tick each acceptance criterion.",
            estimated_minutes=10,
            acceptance_criteria=["Every criterion verified"],
            dependencies=[second_id],
            sequence=3,
            tags=["closeout"],
        ),
    ]
