# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``weekly_rollup`` tool implementation."""

from __future__ import annotations

from datetime import UTC

from neurodock_mcp_cognitive_graph.clock import Clock
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.resolution import resolve
from neurodock_mcp_cognitive_graph.rollup import (
    collect_decisions_in_window,
    collect_open_blockers,
    compute_period,
    render_summary,
    synthesise_next_actions,
)
from neurodock_mcp_cognitive_graph.storage.base import Storage
from neurodock_mcp_cognitive_graph.tools._shared import fact_row_to_fact
from neurodock_mcp_cognitive_graph.types import WeeklyRollupResult


def weekly_rollup(
    storage: Storage,
    clock: Clock,
    project: str | None = None,
) -> WeeklyRollupResult:
    """Return the trailing-seven-day activity summary."""
    if project is not None and (not isinstance(project, str) or not project.strip()):
        # Treat empty string as null per the schema's null-or-absent intent.
        project = None
    project_name: str | None = None
    project_id: str | None = None

    if project is not None:
        resolution = resolve(storage, project.strip(), preferred_type="project")
        if resolution.entity is None or resolution.entity.type != "project":
            raise ToolError(
                "PROJECT_NOT_FOUND",
                "project name supplied but did not resolve to a project entity.",
            )
        project_name = resolution.entity.name
        project_id = resolution.entity.id

    now = clock.now()
    today = now.astimezone(UTC).date()
    period = compute_period(today)

    decisions = collect_decisions_in_window(storage, period, project_id)
    blockers = collect_open_blockers(storage, project_id)

    tagged_facts_rows = storage.facts_by_predicate("tagged")
    tagged_facts = [fact_row_to_fact(r, storage) for r in tagged_facts_rows]

    next_actions = synthesise_next_actions(decisions, blockers, tagged_facts)
    summary = render_summary(project_name, decisions, blockers, next_actions)

    return WeeklyRollupResult(
        project=project_name,
        period=period,
        summary=summary,
        decisions=decisions,
        blockers=blockers,
        next_actions=next_actions,
        generated_at=now,
    )
