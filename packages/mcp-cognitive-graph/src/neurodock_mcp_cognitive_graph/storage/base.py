# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Storage protocol and row dataclasses shared across backings."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Protocol

from neurodock_mcp_cognitive_graph.types import EntityType, Predicate

SurfaceKind = Literal["name", "alias"]
"""Whether an embedding row belongs to the canonical name or to an alias."""

DEFAULT_FACTS_CAP = 500
"""Hard cap on facts returned per ``recall_entity`` call."""

DEFAULT_RELATED_CAP = 20
"""Hard cap on neighbours returned per ``recall_entity`` call."""

DEFAULT_DECISIONS_CAP = 200
"""Hard cap on decisions returned per ``recall_decisions`` call."""

PROJECT_DECISION_PREDICATES: tuple[Predicate, ...] = ("decided_in", "belongs_to")
"""Predicates that link a ``decision`` entity to its project (either orientation).

A decision counts as belonging to a project when a ``decision``-type entity is
joined to the project by EITHER ``decided_in`` (``project decided_in decision``)
OR ``belongs_to`` (``decision belongs_to project``). The latter is the shape an
LLM client naturally records, so both decision read-paths must honour it.
"""


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
class EmbeddingRow:
    """One embedded surface form of an entity (its name or one alias)."""

    entity_id: str
    surface_kind: SurfaceKind
    surface_text: str
    vector: bytes  # raw float32 little-endian bytes
    dim: int
    model: str


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
        """Return facts whose predicate is in :data:`PROJECT_DECISION_PREDICATES`
        (``decided_in`` or ``belongs_to``) and where the project entity is either
        subject or object."""

    def decisions_for_project(self, project_id: str) -> list[EntityRow]:
        """Return entities of type ``decision`` linked to the project by a
        ``decided_in`` or ``belongs_to`` fact (either orientation)."""

    def all_decision_entities(self) -> list[EntityRow]: ...

    def facts_by_predicate(
        self,
        predicate: Predicate,
        since: datetime | None = None,
    ) -> list[FactRow]: ...

    def all_entities(self) -> list[EntityRow]: ...

    # -- embeddings (v0.0.2) ---------------------------------------------

    def upsert_embedding(
        self,
        entity_id: str,
        surface_kind: SurfaceKind,
        surface_text: str,
        vector: bytes,
        dim: int,
        model: str,
        *,
        now: datetime,
    ) -> None:
        """Insert or replace one embedding row.

        ``surface_kind`` is ``"name"`` for the canonical display name and
        ``"alias"`` for any of the entity's aliases. The triple
        ``(entity_id, surface_kind, surface_text)`` is the primary key.
        """

    def all_embeddings(self) -> list[EmbeddingRow]:
        """Return every embedding row in stable order. Used by the NumPy
        fallback when sqlite-vec is unavailable."""

    def delete_embeddings_for_entity(self, entity_id: str) -> None:
        """Remove all embedding rows for an entity. Used when re-embedding
        after a model swap is detected."""

    # -- resolution cache (v0.0.2) ---------------------------------------

    def get_cached_resolution(
        self,
        input_text: str,
    ) -> tuple[str, str, float] | None:
        """Return ``(entity_id, method, score)`` if the input was cached."""

    def cache_resolution(
        self,
        input_text: str,
        entity_id: str,
        method: str,
        score: float,
        *,
        now: datetime,
    ) -> None:
        """Persist a resolved input so subsequent lookups short-circuit."""
