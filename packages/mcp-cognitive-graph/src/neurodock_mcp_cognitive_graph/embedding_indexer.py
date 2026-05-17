"""Write-side embedding indexing.

Centralises the logic for "we just touched this entity, refresh its
embedding rows". Called from :mod:`record_fact`-adjacent code paths so any
name or alias mutation keeps the ``entity_embeddings`` table in sync.

Indexing is best-effort: if the embedder is opted out or fails, the rest of
the tool call still succeeds. The embedding rung simply degrades to "no
match" until the next successful index pass.
"""

from __future__ import annotations

import logging
from datetime import datetime

from neurodock_mcp_cognitive_graph.embeddings import (
    DEFAULT_MODEL,
    Embedder,
    get_embedder,
    vector_to_bytes,
)
from neurodock_mcp_cognitive_graph.storage.base import EntityRow, Storage

logger = logging.getLogger(__name__)


def index_entity(
    storage: Storage,
    entity: EntityRow,
    now: datetime,
    *,
    embedder: Embedder | None = None,
) -> None:
    """Embed the entity's name and every alias, upserting one row per surface.

    Idempotent: existing rows are replaced (see the ``ON CONFLICT`` clause in
    :meth:`SQLiteStorage.upsert_embedding`).
    """
    active = embedder if embedder is not None else get_embedder()
    if active is None:
        return
    surfaces: list[tuple[str, str]] = [("name", entity.name)]
    surfaces.extend(("alias", a) for a in entity.aliases if a)
    if not surfaces:
        return
    try:
        vectors = active.embed_many([text for _, text in surfaces])
    except Exception:  # noqa: BLE001
        logger.exception(
            "embedding entity surfaces failed entity=%s",
            entity.id,
        )
        return
    model_name = getattr(active, "model_name", DEFAULT_MODEL)
    for (kind, text), vec in zip(surfaces, vectors, strict=True):
        storage.upsert_embedding(
            entity_id=entity.id,
            surface_kind=kind,  # type: ignore[arg-type]
            surface_text=text,
            vector=vector_to_bytes(vec),
            dim=int(vec.shape[0]),
            model=model_name,
            now=now,
        )
