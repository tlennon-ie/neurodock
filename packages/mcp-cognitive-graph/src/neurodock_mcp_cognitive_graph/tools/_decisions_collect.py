# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Helpers for ``recall_decisions``.

Extracted so the ``recall_decisions.py`` tool file stays under the
operating-manual 200-line budget.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from datetime import date as _date

from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.base import EntityRow, Storage
from neurodock_mcp_cognitive_graph.types import DecisionAttributor


def parse_since(raw: str | None) -> _date | None:
    """Parse the optional ``since`` filter into a date or raise SINCE_INVALID."""
    if raw is None or raw == "":
        return None
    try:
        return _date.fromisoformat(raw)
    except (TypeError, ValueError) as exc:
        raise ToolError("SINCE_INVALID", f"since '{raw}' is not a valid ISO 8601 date.") from exc


def decision_decided_on(entity: EntityRow, decided_in_recorded_at: datetime | None) -> _date:
    """Pick the date used to sort/filter a decision."""
    if decided_in_recorded_at is not None:
        return decided_in_recorded_at.astimezone(UTC).date()
    if entity.created_at is not None:
        return entity.created_at.astimezone(UTC).date()
    return _date.min  # pragma: no cover


def collect_decisions(
    storage: Storage,
    project_id: str,
) -> Iterable[tuple[EntityRow, datetime | None, list[DecisionAttributor]]]:
    """Yield (decision_entity, decided_in_recorded_at, attributors)."""
    decided_in_facts = storage.facts_for_project_decisions(project_id)

    by_decision: dict[str, datetime] = {}
    attributors_by_decision: dict[str, list[DecisionAttributor]] = {}

    for fact in decided_in_facts:
        decision_id: str | None = None
        if fact.subject_id == project_id and fact.object_id is not None:
            decision_id = fact.object_id
        elif fact.object_id == project_id:
            decision_id = fact.subject_id
        if decision_id is None:
            continue

        existing_at = by_decision.get(decision_id)
        if existing_at is None or fact.recorded_at > existing_at:
            by_decision[decision_id] = fact.recorded_at
        attributors_by_decision.setdefault(decision_id, [])

    decision_ids_seen = set(by_decision.keys())

    # Person -> decision attributions for decisions we know about.
    for fact in storage.facts_by_predicate("decided_in"):
        if fact.object_id is None or fact.object_id not in decision_ids_seen:
            continue
        person_row = storage.find_entity_by_id(fact.subject_id)
        if person_row is None or person_row.id == project_id:
            continue
        existing_attrs = attributors_by_decision.setdefault(fact.object_id, [])
        attr = DecisionAttributor(type=person_row.type, id=person_row.id, name=person_row.name)
        if attr not in existing_attrs:
            existing_attrs.append(attr)

    for did, recorded_at in by_decision.items():
        ent = storage.find_entity_by_id(did)
        if ent is None or ent.type != "decision":
            continue
        yield ent, recorded_at, attributors_by_decision.get(did, [])
