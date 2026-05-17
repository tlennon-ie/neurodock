"""Pure-Python in-memory storage backing.

Used in tests for determinism and as a reference implementation against which
the SQLite backing is cross-checked. Provides identical semantics to
:class:`SQLiteStorage`.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime

from neurodock_mcp_cognitive_graph.storage.base import (
    DEFAULT_FACTS_CAP,
    DEFAULT_RELATED_CAP,
    EntityRow,
    FactRow,
)
from neurodock_mcp_cognitive_graph.types import EntityType, Predicate


def _new_entity_id() -> str:
    return f"ent_{uuid.uuid4().hex[:24]}"


class InMemoryStorage:
    """In-memory, dict-backed storage used by tests."""

    def __init__(self) -> None:
        self._entities: dict[str, EntityRow] = {}
        self._facts: dict[str, FactRow] = {}
        self._provenance: list[tuple[str, str | None, float, datetime]] = []

    # -- lifecycle --------------------------------------------------------

    def initialise(self) -> None:  # pragma: no cover — trivial
        return None

    def close(self) -> None:  # pragma: no cover — trivial
        return None

    # -- entities ---------------------------------------------------------

    def find_entity_by_id(self, entity_id: str) -> EntityRow | None:
        return self._entities.get(entity_id)

    def find_entity_exact(self, entity_type: EntityType, name: str) -> EntityRow | None:
        for row in self._entities.values():
            if row.type == entity_type and row.name == name:
                return row
        return None

    def find_entity_by_name_any_type(self, name: str) -> EntityRow | None:
        for row in sorted(self._entities.values(), key=lambda r: r.created_at or datetime.min):
            if row.name == name:
                return row
        return None

    def find_entity_by_alias(self, alias: str) -> EntityRow | None:
        needle = alias.casefold()
        # Prefer exact-name match if one exists.
        for row in self._entities.values():
            if row.name.casefold() == needle:
                return row
        for row in self._entities.values():
            for a in row.aliases:
                if a.casefold() == needle:
                    return row
        return None

    def upsert_entity(
        self,
        entity_type: EntityType,
        name: str,
        *,
        now: datetime,
    ) -> tuple[EntityRow, bool]:
        existing = self.find_entity_exact(entity_type, name)
        if existing is not None:
            return existing, False
        row = EntityRow(
            id=_new_entity_id(),
            type=entity_type,
            name=name,
            aliases=(),
            created_at=now,
        )
        self._entities[row.id] = row
        return row, True

    def add_alias(self, entity_id: str, alias: str) -> None:
        row = self._entities.get(entity_id)
        if row is None:
            return
        if alias in row.aliases or alias == row.name:
            return
        new_row = EntityRow(
            id=row.id,
            type=row.type,
            name=row.name,
            aliases=(*row.aliases, alias),
            created_at=row.created_at,
        )
        self._entities[row.id] = new_row

    # -- facts ------------------------------------------------------------

    def find_fact_canonical(
        self,
        subject_id: str,
        predicate: Predicate,
        object_id: str | None,
        object_literal: str | None,
    ) -> FactRow | None:
        for row in self._facts.values():
            if (
                row.subject_id == subject_id
                and row.predicate == predicate
                and row.object_id == object_id
                and row.object_literal == object_literal
            ):
                return row
        return None

    def insert_fact(self, fact: FactRow) -> None:
        self._facts[fact.id] = fact

    def insert_provenance(
        self,
        canonical_fact_id: str,
        source: str | None,
        confidence: float,
        recorded_at: datetime,
    ) -> None:
        self._provenance.append((canonical_fact_id, source, confidence, recorded_at))

    def facts_touching_entity(
        self,
        entity_id: str,
        limit: int = DEFAULT_FACTS_CAP,
    ) -> tuple[list[FactRow], bool]:
        hits = [
            row
            for row in self._facts.values()
            if row.subject_id == entity_id or row.object_id == entity_id
        ]
        hits.sort(key=lambda r: r.recorded_at, reverse=True)
        truncated = len(hits) > limit
        return hits[:limit], truncated

    def neighbour_counts(
        self,
        entity_id: str,
        limit: int = DEFAULT_RELATED_CAP,
    ) -> list[tuple[str, int]]:
        counts: Counter[str] = Counter()
        for row in self._facts.values():
            if row.subject_id == entity_id and row.object_id is not None:
                counts[row.object_id] += 1
            elif row.object_id == entity_id:
                counts[row.subject_id] += 1
        return [(eid, cnt) for eid, cnt in counts.most_common(limit)]

    def facts_for_project_decisions(self, project_id: str) -> list[FactRow]:
        return [
            row
            for row in self._facts.values()
            if row.predicate == "decided_in"
            and (row.subject_id == project_id or row.object_id == project_id)
        ]

    def decisions_for_project(self, project_id: str) -> list[EntityRow]:
        decision_ids: set[str] = set()
        for row in self._facts.values():
            if row.predicate != "decided_in":
                continue
            if row.subject_id == project_id and row.object_id is not None:
                decision_ids.add(row.object_id)
            elif row.object_id == project_id:
                decision_ids.add(row.subject_id)
        out: list[EntityRow] = []
        for did in decision_ids:
            ent = self._entities.get(did)
            if ent is not None and ent.type == "decision":
                out.append(ent)
        return out

    def all_decision_entities(self) -> list[EntityRow]:
        return [row for row in self._entities.values() if row.type == "decision"]

    def facts_by_predicate(
        self,
        predicate: Predicate,
        since: datetime | None = None,
    ) -> list[FactRow]:
        rows = [r for r in self._facts.values() if r.predicate == predicate]
        if since is not None:
            rows = [r for r in rows if r.recorded_at >= since]
        return rows

    def all_entities(self) -> list[EntityRow]:
        return list(self._entities.values())
