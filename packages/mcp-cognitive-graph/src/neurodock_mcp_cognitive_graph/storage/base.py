"""Storage protocol and row dataclasses shared across backings."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from neurodock_mcp_cognitive_graph.types import EntityType, Predicate

DEFAULT_FACTS_CAP = 500
"""Hard cap on facts returned per ``recall_entity`` call."""

DEFAULT_RELATED_CAP = 20
"""Hard cap on neighbours returned per ``recall_entity`` call."""

DEFAULT_DECISIONS_CAP = 200
"""Hard cap on decisions returned per ``recall_decisions`` call."""


@dataclass(frozen=True)
class EntityRow:
    """In-memory representation of an entity row.

    The storage backing converts to/from this shape; tool code only sees this.
    """

    id: str
    type: EntityType
    name: str
    aliases: tuple[str, ...] = field(default_factory=tuple)
    created_at: datetime | None = None


@dataclass(frozen=True)
class FactRow:
    """In-memory representation of a fact row."""

    id: str
    subject_id: str
    predicate: Predicate
    object_kind: str  # 'entity' | 'literal'
    object_id: str | None
    object_literal: str | None
    source: str | None
    confidence: float
    recorded_at: datetime


class Storage(Protocol):
    """The contract every storage backing must satisfy."""

    def initialise(self) -> None:
        """Apply schema migrations. Idempotent."""

    def close(self) -> None:
        """Release any open resources."""

    # -- entities ---------------------------------------------------------

    def find_entity_by_id(self, entity_id: str) -> EntityRow | None: ...

    def find_entity_exact(self, entity_type: EntityType, name: str) -> EntityRow | None:
        """Exact (type, name) lookup."""

    def find_entity_by_name_any_type(self, name: str) -> EntityRow | None:
        """Exact name match, any type. Returns first match (deterministic order)."""

    def find_entity_by_alias(self, alias: str) -> EntityRow | None:
        """Search the aliases JSON arrays for an exact case-insensitive match."""

    def upsert_entity(
        self,
        entity_type: EntityType,
        name: str,
        *,
        now: datetime,
    ) -> tuple[EntityRow, bool]:
        """Insert-or-fetch by (type, name). Returns (row, created)."""

    def add_alias(self, entity_id: str, alias: str) -> None:
        """Append an alias to the entity if absent."""

    # -- facts ------------------------------------------------------------

    def find_fact_canonical(
        self,
        subject_id: str,
        predicate: Predicate,
        object_id: str | None,
        object_literal: str | None,
    ) -> FactRow | None:
        """Look up an existing canonical fact for dedup."""

    def insert_fact(self, fact: FactRow) -> None: ...

    def insert_provenance(
        self,
        canonical_fact_id: str,
        source: str | None,
        confidence: float,
        recorded_at: datetime,
    ) -> None: ...

    def facts_touching_entity(
        self,
        entity_id: str,
        limit: int = DEFAULT_FACTS_CAP,
    ) -> tuple[list[FactRow], bool]:
        """Return facts whose subject_id or object_id equals entity_id.

        Returns ``(rows, truncated)`` where ``truncated`` is True if more than
        ``limit`` rows matched.
        """

    def neighbour_counts(
        self,
        entity_id: str,
        limit: int = DEFAULT_RELATED_CAP,
    ) -> list[tuple[str, int]]:
        """Return (neighbour_entity_id, co_occurrence_count) tuples."""

    def facts_for_project_decisions(
        self,
        project_id: str,
    ) -> list[FactRow]:
        """Return facts whose predicate is ``decided_in`` and where the
        project entity is either subject or object."""

    def decisions_for_project(self, project_id: str) -> list[EntityRow]:
        """Return entities of type ``decision`` linked to the project."""

    def all_decision_entities(self) -> list[EntityRow]: ...

    def facts_by_predicate(
        self,
        predicate: Predicate,
        since: datetime | None = None,
    ) -> list[FactRow]: ...

    def all_entities(self) -> list[EntityRow]: ...
