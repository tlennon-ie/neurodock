# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``next_one`` tool implementation.

Reads pending tasks from a :class:`PendingTaskSource` and returns exactly one
task: the lowest-``sequence`` task whose dependencies are all already complete
(per ADR 0003 §6 — total order makes 'sequence=1 of the unfinished subset'
trivially the right pick).
"""

from __future__ import annotations

from neurodock_mcp_task_fractionator.sources import PendingTaskSource
from neurodock_mcp_task_fractionator.types import NextOneOutput, Task


class ProjectRequiredError(ValueError):
    """Raised when the ``project`` argument is missing or empty after trim."""


class ProjectTooLongError(ValueError):
    """Raised when ``project`` exceeds 120 characters."""


class NoTasksAvailableError(RuntimeError):
    """Raised when the project has no pending tasks."""


class AllTasksBlockedError(RuntimeError):
    """Raised when every pending task has unmet dependencies.

    Carries one example blocked task id and its blocker ids so the caller
    can surface a useful message. Per the schema's error payload guidance.
    """

    def __init__(self, *, blocked_task_id: str, blocker_ids: list[str]) -> None:
        super().__init__(f"task {blocked_task_id} blocked by {blocker_ids}")
        self.blocked_task_id = blocked_task_id
        self.blocker_ids = blocker_ids


def next_one(*, project: str, source: PendingTaskSource) -> NextOneOutput:
    """Return exactly one task for ``project``.

    Validation:
    - ``project`` is a non-empty string of at most 120 characters.

    Selection:
    - Among pending tasks, pick the one with the lowest ``sequence`` whose
      ``dependencies`` are all NOT present in the pending set (i.e. already
      complete, in cognitive-graph terms).
    - If no candidate has all dependencies satisfied, raise
      :class:`AllTasksBlockedError`.
    - If the pending list is empty, raise :class:`NoTasksAvailableError`.
    """

    if not isinstance(project, str):
        raise ProjectRequiredError("project must be a string")
    trimmed = project.strip()
    if not trimmed:
        raise ProjectRequiredError("project must be a non-empty string")
    if len(trimmed) > 120:
        raise ProjectTooLongError("project exceeds 120 characters")

    pending = source.list_pending(trimmed)
    if not pending:
        raise NoTasksAvailableError(f"no pending tasks for project: {trimmed}")

    pending_ids = {t.id for t in pending}
    unblocked: list[Task] = [
        task for task in pending if all(dep not in pending_ids for dep in task.dependencies)
    ]
    if not unblocked:
        # Surface one blocked example. The caller can branch on the structured
        # fields rather than parsing the message.
        sample = min(pending, key=lambda t: t.sequence)
        blocker_ids = [dep for dep in sample.dependencies if dep in pending_ids]
        raise AllTasksBlockedError(blocked_task_id=sample.id, blocker_ids=blocker_ids)

    chosen = min(unblocked, key=lambda t: t.sequence)
    confidence = _confidence_for(chosen=chosen, unblocked=unblocked, pending_total=len(pending))
    reasoning = _reasoning_for(chosen=chosen, unblocked=unblocked, pending_total=len(pending))
    return NextOneOutput(task=chosen, reasoning=reasoning, confidence=confidence)


def _confidence_for(*, chosen: Task, unblocked: list[Task], pending_total: int) -> float:
    """Score the answer between 0 and 1.

    Sequence 1 with a single candidate is 0.95 (matches the schema example).
    Each parallel candidate drops 0.1, floored at 0.4. Unknown projects with
    no decomposition history would not reach this function (they hit
    NO_TASKS_AVAILABLE earlier), so we never return 0.0.
    """

    base = 0.95 if chosen.sequence == 1 else 0.85
    parallel_penalty = max(0, len(unblocked) - 1) * 0.1
    pending_factor = 0.0 if pending_total <= 12 else 0.05
    score = max(0.4, base - parallel_penalty - pending_factor)
    return round(score, 2)


def _reasoning_for(*, chosen: Task, unblocked: list[Task], pending_total: int) -> str:
    """Build the reasoning paragraph.

    NEVER include free-form user content (project name, goal text). The task
    title is content the server generated for the user; surfacing it is the
    point of the tool.
    """

    pieces: list[str] = [
        f"Sequence {chosen.sequence} with all dependencies satisfied.",
    ]
    if len(unblocked) == 1:
        pieces.append("No other unblocked candidates, so this is the unique next step.")
    else:
        pieces.append(f"{len(unblocked)} candidates were unblocked; picked the lowest sequence.")
    pieces.append(f"{pending_total} task(s) still pending in this project.")
    reasoning = " ".join(pieces)
    if len(reasoning) > 600:
        reasoning = reasoning[:597].rstrip() + "..."
    return reasoning
