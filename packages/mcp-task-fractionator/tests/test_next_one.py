"""Unit tests for ``next_one``."""

from __future__ import annotations

import pytest
from neurodock_mcp_task_fractionator.sources import InMemoryPendingTaskSource
from neurodock_mcp_task_fractionator.tools.next_one import (
    AllTasksBlockedError,
    NoTasksAvailableError,
    ProjectRequiredError,
    ProjectTooLongError,
    next_one,
)
from neurodock_mcp_task_fractionator.types import Task

PROJECT = "founding-scope-rfc"


def test_returns_lowest_sequence_unblocked_task(
    in_memory_source: InMemoryPendingTaskSource, sample_tasks: list[Task]
) -> None:
    """With a linear chain, the sequence-1 task is the answer."""

    in_memory_source.add(PROJECT, sample_tasks)
    output = next_one(project=PROJECT, source=in_memory_source)
    assert output.task.id == sample_tasks[0].id
    assert output.task.sequence == 1
    assert 0.0 <= output.confidence <= 1.0


def test_returns_next_after_first_completed(
    in_memory_source: InMemoryPendingTaskSource, sample_tasks: list[Task]
) -> None:
    """Completing sequence 1 unblocks sequence 2 — that becomes the answer."""

    # Simulate completion by removing the first task from the pending list.
    in_memory_source.add(PROJECT, sample_tasks)
    in_memory_source.remove(PROJECT, sample_tasks[0].id)

    output = next_one(project=PROJECT, source=in_memory_source)
    assert output.task.id == sample_tasks[1].id
    assert output.task.sequence == 2


def test_empty_project_raises_no_tasks_available(
    in_memory_source: InMemoryPendingTaskSource,
) -> None:
    """An empty pending list raises NO_TASKS_AVAILABLE."""

    with pytest.raises(NoTasksAvailableError):
        next_one(project="unknown-project", source=in_memory_source)


def test_blocked_chain_raises_all_tasks_blocked(
    in_memory_source: InMemoryPendingTaskSource, sample_tasks: list[Task]
) -> None:
    """If every task references a still-pending dependency, raise ALL_TASKS_BLOCKED.

    We craft a synthetic case where the only pending task lists a still-pending
    dependency that is not actually in the pending set in some realistic flows
    — but here we force the blocked state by adding only the dependent.

    Practical realisation: add a task that depends on itself's predecessor,
    but the predecessor is also pending and depends back on it (impossible to
    create via decompose, but a valid hostile cognitive-graph state to test).
    """

    a_id = sample_tasks[0].id
    b_id = sample_tasks[1].id
    blocked_a = Task(
        id=a_id,
        title=sample_tasks[0].title,
        description=sample_tasks[0].description,
        estimated_minutes=sample_tasks[0].estimated_minutes,
        acceptance_criteria=sample_tasks[0].acceptance_criteria,
        dependencies=[b_id],
        sequence=1,
        tags=sample_tasks[0].tags,
    )
    blocked_b = Task(
        id=b_id,
        title=sample_tasks[1].title,
        description=sample_tasks[1].description,
        estimated_minutes=sample_tasks[1].estimated_minutes,
        acceptance_criteria=sample_tasks[1].acceptance_criteria,
        dependencies=[a_id],
        sequence=2,
        tags=sample_tasks[1].tags,
    )
    in_memory_source.add(PROJECT, [blocked_a, blocked_b])

    with pytest.raises(AllTasksBlockedError) as info:
        next_one(project=PROJECT, source=in_memory_source)
    assert info.value.blocked_task_id in {a_id, b_id}
    assert info.value.blocker_ids


def test_empty_project_string_raises_project_required(
    in_memory_source: InMemoryPendingTaskSource,
) -> None:
    """An empty / whitespace project name raises PROJECT_REQUIRED."""

    with pytest.raises(ProjectRequiredError):
        next_one(project="   ", source=in_memory_source)


def test_overlong_project_raises_project_too_long(
    in_memory_source: InMemoryPendingTaskSource,
) -> None:
    """A project name longer than 120 characters raises ProjectTooLongError."""

    long_project = "x" * 121
    with pytest.raises(ProjectTooLongError):
        next_one(project=long_project, source=in_memory_source)


@pytest.mark.asyncio
async def test_server_maps_project_too_long_to_correct_code() -> None:
    """Server must map ProjectTooLongError → error code PROJECT_TOO_LONG (not PROJECT_REQUIRED)."""

    from fastmcp import Client
    from neurodock_mcp_task_fractionator.server import build_server

    server = build_server(source=InMemoryPendingTaskSource())
    long_project = "y" * 121
    async with Client(server) as client:
        with pytest.raises(Exception) as exc_info:
            await client.call_tool("next_one", {"project": long_project})
        assert "PROJECT_TOO_LONG" in str(exc_info.value)
