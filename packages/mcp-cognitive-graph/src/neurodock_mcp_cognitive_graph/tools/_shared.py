"""Helpers shared between tool implementations."""

from __future__ import annotations

import uuid

from neurodock_mcp_cognitive_graph.storage.base import EntityRow, FactRow, Storage
from neurodock_mcp_cognitive_graph.types import (
    EntityRecord,
    Fact,
    FactObjectEntity,
    FactSubject,
    LiteralValue,
)

PREDICATE_VOCABULARY: frozenset[str] = frozenset(
    {
        "mentioned_in",
        "decided_in",
        "reports_to",
        "depends_on",
        "resolved_by",
        "blocked_by",
        "tagged",
        "belongs_to",
    }
)


def new_fact_id() -> str:
    """Generate a stable, opaque fact id."""
    return f"fact_{uuid.uuid4().hex[:24]}"


def entity_row_to_record(row: EntityRow) -> EntityRecord:
    """Project an internal :class:`EntityRow` to the schema ``EntityRecord``."""
    if row.created_at is None:
        raise ValueError(f"Entity {row.id} is missing created_at")
    return EntityRecord(
        id=row.id,
        type=row.type,
        name=row.name,
        aliases=list(row.aliases),
        created_at=row.created_at,
    )


def fact_row_to_fact(row: FactRow, storage: Storage) -> Fact:
    """Project an internal :class:`FactRow` to the schema ``Fact``.

    Resolves the subject and (if entity-typed) object entity rows so the
    output contains the full {type, id, name} triple. Raises if a referenced
    entity is missing — that would be a storage-corruption case.
    """
    subj_row = storage.find_entity_by_id(row.subject_id)
    if subj_row is None:
        raise RuntimeError(f"Fact {row.id} references missing subject {row.subject_id}")
    subject = FactSubject(type=subj_row.type, id=subj_row.id, name=subj_row.name)

    obj: FactObjectEntity | LiteralValue
    if row.object_kind == "entity":
        if row.object_id is None:
            raise RuntimeError(f"Fact {row.id} has object_kind=entity but no object_id")
        obj_row = storage.find_entity_by_id(row.object_id)
        if obj_row is None:
            raise RuntimeError(f"Fact {row.id} references missing object {row.object_id}")
        obj = FactObjectEntity(type=obj_row.type, id=obj_row.id, name=obj_row.name)
    else:
        if row.object_literal is None:
            raise RuntimeError(f"Fact {row.id} has object_kind=literal but no object_literal")
        obj = LiteralValue(literal=row.object_literal)

    return Fact(
        id=row.id,
        subject=subject,
        predicate=row.predicate,
        object=obj,
        source=row.source,
        confidence=row.confidence,
        recorded_at=row.recorded_at,
    )
