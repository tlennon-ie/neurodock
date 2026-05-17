"""Subject and object resolution helpers used by ``record_fact``.

Extracted out of ``record_fact.py`` to keep each tool file under the
operating-manual 200-line budget while preserving a clean two-step pipeline:
resolve the subject, resolve the object, then write the fact.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from neurodock_mcp_cognitive_graph.embedding_indexer import index_entity
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.base import Storage
from neurodock_mcp_cognitive_graph.types import (
    AutoCreatedEntity,
    EntityType,
    FactObjectEntity,
    FactSubject,
    LiteralValue,
)

VALID_ENTITY_TYPES: frozenset[str] = frozenset(
    {"person", "project", "decision", "concept", "source"}
)


def resolve_subject(
    storage: Storage,
    raw: Any,
    now: datetime,
) -> tuple[FactSubject, list[AutoCreatedEntity]]:
    """Return the resolved subject reference and any auto-created entity."""
    if not isinstance(raw, dict):
        raise ToolError("SUBJECT_REQUIRED", "subject must be an object.")
    etype_raw = raw.get("type")
    if etype_raw not in VALID_ENTITY_TYPES:
        raise ToolError(
            "ENTITY_TYPE_UNKNOWN",
            f"subject.type must be one of {sorted(VALID_ENTITY_TYPES)}.",
        )
    etype = cast(EntityType, etype_raw)
    eid = raw.get("id")
    name = raw.get("name")
    auto: list[AutoCreatedEntity] = []
    if eid:
        row = storage.find_entity_by_id(eid)
        if row is None:
            raise ToolError(
                "SUBJECT_REQUIRED",
                "subject.id did not resolve to a known entity.",
            )
    elif name:
        row, created = storage.upsert_entity(etype, name, now=now)
        if created:
            auto.append(AutoCreatedEntity(id=row.id, type=row.type, name=row.name))
            index_entity(storage, row, now)
    else:
        raise ToolError(
            "SUBJECT_REQUIRED",
            "subject must include at least one of {id, name}.",
        )
    return FactSubject(type=row.type, id=row.id, name=row.name), auto


def resolve_object(
    storage: Storage,
    raw: Any,
    now: datetime,
) -> tuple[str | None, str | None, FactObjectEntity | LiteralValue, list[AutoCreatedEntity]]:
    """Return ``(object_id, object_literal, object_payload, auto_created)``."""
    if not isinstance(raw, dict):
        raise ToolError("OBJECT_REQUIRED", "object must be an object.")
    auto: list[AutoCreatedEntity] = []
    if "literal" in raw:
        literal = raw["literal"]
        if not isinstance(literal, str) or not literal:
            raise ToolError("OBJECT_REQUIRED", "object.literal must be a non-empty string.")
        if len(literal) > 1000:
            raise ToolError("OBJECT_REQUIRED", "object.literal exceeds 1000 characters.")
        return None, literal, LiteralValue(literal=literal), auto

    etype_raw = raw.get("type")
    if etype_raw not in VALID_ENTITY_TYPES:
        raise ToolError(
            "ENTITY_TYPE_UNKNOWN",
            f"object.type must be one of {sorted(VALID_ENTITY_TYPES)}.",
        )
    etype = cast(EntityType, etype_raw)
    eid = raw.get("id")
    name = raw.get("name")
    if eid:
        row = storage.find_entity_by_id(eid)
        if row is None:
            raise ToolError("OBJECT_REQUIRED", "object.id did not resolve.")
    elif name:
        row, created = storage.upsert_entity(etype, name, now=now)
        if created:
            auto.append(AutoCreatedEntity(id=row.id, type=row.type, name=row.name))
            index_entity(storage, row, now)
    else:
        raise ToolError(
            "OBJECT_REQUIRED",
            "object must include literal, or one of {id, name}.",
        )
    payload = FactObjectEntity(type=row.type, id=row.id, name=row.name)
    return row.id, None, payload, auto
