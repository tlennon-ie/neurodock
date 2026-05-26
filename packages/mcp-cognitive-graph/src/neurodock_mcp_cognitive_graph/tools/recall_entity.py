# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``recall_entity`` tool implementation."""

from __future__ import annotations

from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.resolution import resolve
from neurodock_mcp_cognitive_graph.storage.base import (
    DEFAULT_FACTS_CAP,
    DEFAULT_RELATED_CAP,
    Storage,
)
from neurodock_mcp_cognitive_graph.tools._shared import entity_row_to_record, fact_row_to_fact
from neurodock_mcp_cognitive_graph.types import (
    RecallEntityResult,
    RelatedEntity,
    Resolution,
)

MAX_INPUT_LENGTH = 200


def recall_entity(storage: Storage, name_or_alias: str) -> RecallEntityResult:
    """Resolve a single entity reference and return entity + facts + neighbours.

    ``name_or_alias`` is a single entity reference: a display name, a canonical
    id (e.g. ``ent_01H9X2K3R4S5T6U7V8W9X0Y1Z2``), or any known alias. Pass the
    verbatim string the user uttered — do not lowercase, strip punctuation, or
    pluralise; the 4-rung cascade (exact → case-insensitive alias →
    rapidfuzz WRatio >= 75 → embedding cosine >= 0.82) handles those variants.
    Pass exactly one entity per call; concatenated phrases like
    ``"Roberto and Priya"`` will not match either — call the tool once per
    entity. Required, length 1..200 after trimming.

    A no-match outcome returns ``entity=None`` with
    ``resolution.method='none'`` — that is a successful response, not an
    error. Raises :class:`ToolError`:

    * ``NAME_OR_ALIAS_REQUIRED`` — input was missing or empty after trimming.
    * ``NAME_OR_ALIAS_TOO_LONG`` — input exceeded 200 characters (long
      strings are almost always pasted prose; extract the entity first).
    """
    if not isinstance(name_or_alias, str):
        raise ToolError("NAME_OR_ALIAS_REQUIRED", "name_or_alias must be a string.")
    trimmed = name_or_alias.strip()
    if not trimmed:
        raise ToolError(
            "NAME_OR_ALIAS_REQUIRED",
            "name_or_alias was missing or empty after trimming.",
        )
    if len(trimmed) > MAX_INPUT_LENGTH:
        raise ToolError(
            "NAME_OR_ALIAS_TOO_LONG",
            f"name_or_alias exceeds {MAX_INPUT_LENGTH} characters.",
        )

    resolution = resolve(storage, trimmed)

    if resolution.entity is None:
        return RecallEntityResult(
            entity=None,
            facts=[],
            related_entities=[],
            resolution=Resolution(method="none", score=0.0),
            truncated_facts=False,
        )

    entity_row = resolution.entity
    fact_rows, truncated = storage.facts_touching_entity(entity_row.id, limit=DEFAULT_FACTS_CAP)
    facts = [fact_row_to_fact(r, storage) for r in fact_rows]

    neighbours = storage.neighbour_counts(entity_row.id, limit=DEFAULT_RELATED_CAP)
    related_entities: list[RelatedEntity] = []
    for nid, count in neighbours:
        nrow = storage.find_entity_by_id(nid)
        if nrow is None:
            continue
        related_entities.append(
            RelatedEntity(
                id=nrow.id,
                type=nrow.type,
                name=nrow.name,
                co_occurrence_count=count,
            )
        )

    return RecallEntityResult(
        entity=entity_row_to_record(entity_row),
        facts=facts,
        related_entities=related_entities,
        resolution=Resolution(method=resolution.method, score=resolution.score),
        truncated_facts=truncated,
    )
