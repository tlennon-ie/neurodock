# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
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

# A minimal valid call shape, surfaced in friendly errors so the caller
# can see what the tool actually wants without re-reading the schema.
_VALID_CALL_EXAMPLE: dict[str, Any] = {
    "subject": {"type": "person", "name": "Roberto"},
    "predicate": "decided_in",
    "object": {"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
}


def _describe_received(raw: Any) -> str:
    """Render the actual input shape for the friendly error message."""
    if raw is None:
        return "got nothing"
    if isinstance(raw, str):
        return f"got a bare string ({raw!r})"
    if isinstance(raw, list):
        return f"got a list of length {len(raw)}"
    if isinstance(raw, dict):
        keys = sorted(raw.keys())
        return f"got an object with keys {keys}"
    return f"got a value of type {type(raw).__name__}"


def resolve_subject(
    storage: Storage,
    raw: Any,
    now: datetime,
) -> tuple[FactSubject, list[AutoCreatedEntity]]:
    """Return the resolved subject reference and any auto-created entity."""
    valid_types = sorted(VALID_ENTITY_TYPES)
    if not isinstance(raw, dict):
        raise ToolError(
            "SUBJECT_REQUIRED",
            f"subject must be an object; {_describe_received(raw)}.",
            hint=(
                "Pass `subject` as an object with `type` and `name` (or `id`). "
                "It is not a free-text string."
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    etype_raw = raw.get("type")
    if etype_raw is None:
        raise ToolError(
            "ENTITY_TYPE_UNKNOWN",
            f"subject.type is required; must be one of {valid_types}.",
            hint=(
                f"Add a `type` field to `subject`, one of: {', '.join(valid_types)}. "
                "If you are recording something about a bug or feature, use `concept`."
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    if etype_raw not in VALID_ENTITY_TYPES:
        raise ToolError(
            "ENTITY_TYPE_UNKNOWN",
            f"subject.type {etype_raw!r} is not valid; must be one of {valid_types}.",
            hint=(
                f"Use one of: {', '.join(valid_types)}. "
                "There is no `feature`, `bug`, or `task` type in v0.1 — fall back to `concept` for those."
            ),
            example=_VALID_CALL_EXAMPLE,
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
                f"subject.id {eid!r} did not resolve to a known entity.",
                hint=(
                    "Either drop the `id` and pass `name` (the entity will be "
                    "auto-created), or look up the id first with `recall_entity`."
                ),
                example=_VALID_CALL_EXAMPLE,
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
            hint=(
                "Add a `name` to `subject` (the entity will be auto-created if it "
                "does not yet exist), or pass an existing `id`."
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    return FactSubject(type=row.type, id=row.id, name=row.name), auto


def resolve_object(
    storage: Storage,
    raw: Any,
    now: datetime,
) -> tuple[str | None, str | None, FactObjectEntity | LiteralValue, list[AutoCreatedEntity]]:
    """Return ``(object_id, object_literal, object_payload, auto_created)``."""
    valid_types = sorted(VALID_ENTITY_TYPES)
    if not isinstance(raw, dict):
        raise ToolError(
            "OBJECT_REQUIRED",
            f"object must be an object; {_describe_received(raw)}.",
            hint=(
                "Pass `object` as an entity reference "
                '(`{"type": ..., "name": ...}`) or a literal '
                '(`{"literal": "..."}`). It is not a bare string.'
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    auto: list[AutoCreatedEntity] = []
    if "literal" in raw:
        literal = raw["literal"]
        if not isinstance(literal, str) or not literal:
            raise ToolError(
                "OBJECT_REQUIRED",
                "object.literal must be a non-empty string.",
                hint="Pass `object.literal` as a non-empty string (used for tags, statuses, short notes).",
                example={
                    "subject": {"type": "project", "name": "kipi-system"},
                    "predicate": "tagged",
                    "object": {"literal": "external-memory"},
                },
            )
        if len(literal) > 1000:
            raise ToolError(
                "OBJECT_REQUIRED",
                "object.literal exceeds 1000 characters.",
                hint=(
                    "Literals are capped at 1000 characters. For long notes, "
                    "split the content or store it as an entity with a short name."
                ),
            )
        return None, literal, LiteralValue(literal=literal), auto

    etype_raw = raw.get("type")
    if etype_raw is None:
        raise ToolError(
            "ENTITY_TYPE_UNKNOWN",
            f"object.type is required (or use `literal`); must be one of {valid_types}.",
            hint=(
                f"Either add `type` to `object` (one of: {', '.join(valid_types)}) "
                'and a `name`, or use `{"literal": "..."}` for free-text values.'
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    if etype_raw not in VALID_ENTITY_TYPES:
        raise ToolError(
            "ENTITY_TYPE_UNKNOWN",
            f"object.type {etype_raw!r} is not valid; must be one of {valid_types}.",
            hint=(
                f"Use one of: {', '.join(valid_types)}. "
                "There is no `feature`, `bug`, or `task` type in v0.1 — use `concept` for those."
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    etype = cast(EntityType, etype_raw)
    eid = raw.get("id")
    name = raw.get("name")
    if eid:
        row = storage.find_entity_by_id(eid)
        if row is None:
            raise ToolError(
                "OBJECT_REQUIRED",
                f"object.id {eid!r} did not resolve to a known entity.",
                hint=(
                    "Either drop `id` and pass `name` (the entity will be "
                    "auto-created), or look up the id first with `recall_entity`."
                ),
                example=_VALID_CALL_EXAMPLE,
            )
    elif name:
        row, created = storage.upsert_entity(etype, name, now=now)
        if created:
            auto.append(AutoCreatedEntity(id=row.id, type=row.type, name=row.name))
            index_entity(storage, row, now)
    else:
        raise ToolError(
            "OBJECT_REQUIRED",
            "object must include `literal`, or one of {id, name}.",
            hint=(
                "Add a `name` to `object` for an entity, or use "
                '`{"literal": "..."}` for a free-text value.'
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    payload = FactObjectEntity(type=row.type, id=row.id, name=row.name)
    return row.id, None, payload, auto
