# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``recall_decisions`` tool implementation.

A decision is the UNION of:

* facts where ``predicate == "decided_in"`` and the project is the object
  (canonical orientation) or, defensively, the subject;
* entities whose ``type == "decision"`` linked to the project via a
  ``decided_in`` fact.

Output is ordered by ``decided_on`` descending. The ``since`` filter applies
at the date level. The 200-item cap from the schema is enforced; the
``truncated`` flag is surfaced.
"""

from __future__ import annotations

from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.resolution import resolve
from neurodock_mcp_cognitive_graph.storage.base import Storage
from neurodock_mcp_cognitive_graph.tools._decisions_collect import (
    collect_decisions,
    decision_decided_on,
    parse_since,
)
from neurodock_mcp_cognitive_graph.types import Decision, ProjectRef, RecallDecisionsResult

DECISIONS_HARD_CAP = 200
MAX_PROJECT_INPUT = 200


def recall_decisions(
    storage: Storage,
    project: str,
    since: str | None = None,
) -> RecallDecisionsResult:
    """Return decisions for a project, optionally filtered by since-date."""
    if not isinstance(project, str) or not project.strip():
        raise ToolError("PROJECT_REQUIRED", "project must be a non-empty string.")
    trimmed = project.strip()
    if len(trimmed) > MAX_PROJECT_INPUT:
        raise ToolError(
            "PROJECT_REQUIRED",
            f"project must not exceed {MAX_PROJECT_INPUT} characters.",
        )
    since_date = parse_since(since)

    resolution = resolve(storage, trimmed, preferred_type="project")
    if resolution.entity is None or resolution.entity.type != "project":
        return RecallDecisionsResult(
            project=None,
            decisions=[],
            truncated=False,
            since=since_date,
        )

    project_row = resolution.entity
    triples = list(collect_decisions(storage, project_row.id))

    decisions_out: list[Decision] = []
    for ent, recorded_at, attributors in triples:
        decided_on = decision_decided_on(ent, recorded_at)
        if since_date is not None and decided_on < since_date:
            continue
        decision_source: str | None = None
        decision_confidence: float = 1.0
        for fact in storage.facts_for_project_decisions(project_row.id):
            if fact.object_id == ent.id or fact.subject_id == ent.id:
                decision_confidence = fact.confidence
                if fact.source:
                    decision_source = fact.source
                    break
        decisions_out.append(
            Decision(
                id=ent.id,
                name=ent.name,
                decided_on=decided_on,
                decided_by=attributors,
                source=decision_source,
                confidence=decision_confidence,
                supersedes=None,
            )
        )

    decisions_out.sort(key=lambda d: d.decided_on, reverse=True)
    truncated = len(decisions_out) > DECISIONS_HARD_CAP
    decisions_out = decisions_out[:DECISIONS_HARD_CAP]

    return RecallDecisionsResult(
        project=ProjectRef(id=project_row.id, name=project_row.name),
        decisions=decisions_out,
        truncated=truncated,
        since=since_date,
    )
