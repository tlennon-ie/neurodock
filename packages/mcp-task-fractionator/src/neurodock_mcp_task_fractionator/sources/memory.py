# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""In-memory pending-task source for tests and small skill use-cases."""

from __future__ import annotations

from collections.abc import Iterable
from threading import RLock

from neurodock_mcp_task_fractionator.types import Task


class InMemoryPendingTaskSource:
    """Holds a per-project dict of pending tasks in process memory.

    Tasks are appended in the order callers add them. A lock guards mutation
    so multi-call test scenarios stay deterministic.
    """

    def __init__(self) -> None:
        self._lock = RLock()
        self._by_project: dict[str, list[Task]] = {}

    def add(self, project: str, tasks: Iterable[Task]) -> None:
        """Append ``tasks`` to ``project``'s pending list. Duplicates ignored."""

        with self._lock:
            bucket = self._by_project.setdefault(project, [])
            existing_ids = {t.id for t in bucket}
            for task in tasks:
                if task.id in existing_ids:
                    continue
                bucket.append(task)
                existing_ids.add(task.id)

    def remove(self, project: str, task_id: str) -> None:
        """Drop a single task by id. No-op when the project or id is unknown."""

        with self._lock:
            bucket = self._by_project.get(project)
            if bucket is None:
                return
            self._by_project[project] = [t for t in bucket if t.id != task_id]

    def list_pending(self, project: str) -> list[Task]:
        """Return a defensive copy of the project's pending list."""

        with self._lock:
            return list(self._by_project.get(project, []))

    def clear(self) -> None:
        """Drop all state. Tests call this between cases when reusing a source."""

        with self._lock:
            self._by_project.clear()
