# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Entity resolution.

The full four-rung cascade defined in ``recall_entity.schema.json``:

1. ``exact``     - case-sensitive (type, name) hit.
2. ``alias``     - case-insensitive match on ``name`` or any recorded alias.
3. ``fuzzy``     - :mod:`rapidfuzz` WRatio against every name and alias.
4. ``embedding`` - cosine similarity over stored embeddings via either
   sqlite-vec (when available) or a NumPy fallback.

The cascade short-circuits at the first rung that returns a hit. The
``resolution.score`` carries the similarity on a 0..1 scale; for the fuzzy
rung this is ``WRatio / 100``, for embedding it is cosine similarity.

Thresholds (ADR 0002 open question 1, conservative position):

* Fuzzy: ``WRatio >= 75`` (0.75 in score-space).
* Embedding: cosine ``>= 0.82``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from rapidfuzz import fuzz

from neurodock_mcp_cognitive_graph.embeddings import (
    Embedder,
    get_embedder,
    vector_to_bytes,
)
from neurodock_mcp_cognitive_graph.storage.base import EntityRow, Storage
from neurodock_mcp_cognitive_graph.types import EntityType, ResolutionMethod
from neurodock_mcp_cognitive_graph.vector_search import VectorSearcher, make_searcher

logger = logging.getLogger(__name__)

FUZZY_THRESHOLD = 75
"""Minimum :func:`rapidfuzz.fuzz.WRatio` (0..100) to accept a fuzzy match."""

EMBEDDING_THRESHOLD = 0.82
"""Minimum cosine similarity to accept an embedding match."""

FUZZY_MAX_HITS = 10
"""Cap on candidates evaluated by the fuzzy rung."""

EMBEDDING_MAX_HITS = 10
"""Cap on candidates evaluated by the embedding rung."""


@dataclass(frozen=True)
class Thresholds:
    """Snapshot of the active thresholds, surfaced for diagnostics/tests."""

    fuzzy: int = FUZZY_THRESHOLD
    embedding: float = EMBEDDING_THRESHOLD


@dataclass(frozen=True)
class ResolutionResult:
    """Outcome of an alias-resolve attempt."""

    entity: EntityRow | None
    method: ResolutionMethod
    score: float


def resolve(
    storage: Storage,
    name_or_alias: str,
    *,
    preferred_type: EntityType | None = None,
    embedder: Embedder | None = None,
    vector_searcher: VectorSearcher | None = None,
) -> ResolutionResult:
    """Run the four-rung cascade and return at the first hit.

    The optional ``embedder`` and ``vector_searcher`` arguments are present
    so tests can stub the embedding rung deterministically.
    """
    needle = name_or_alias.strip()
    if not needle:
        return ResolutionResult(entity=None, method="none", score=0.0)

    exact_hit = _resolve_exact(storage, needle, preferred_type)
    if exact_hit is not None:
        return exact_hit

    alias_hit = _resolve_alias(storage, needle)
    if alias_hit is not None:
        return alias_hit

    fuzzy_hit = _resolve_fuzzy(storage, needle)
    if fuzzy_hit is not None:
        return fuzzy_hit

    embedding_hit = _resolve_embedding(
        storage,
        needle,
        embedder=embedder,
        vector_searcher=vector_searcher,
    )
    if embedding_hit is not None:
        return embedding_hit

    return ResolutionResult(entity=None, method="none", score=0.0)


def _resolve_exact(
    storage: Storage,
    needle: str,
    preferred_type: EntityType | None,
) -> ResolutionResult | None:
    if preferred_type is not None:
        hit = storage.find_entity_exact(preferred_type, needle)
        if hit is not None:
            return ResolutionResult(entity=hit, method="exact", score=1.0)
    hit = storage.find_entity_by_name_any_type(needle)
    if hit is not None:
        return ResolutionResult(entity=hit, method="exact", score=1.0)
    return None


def _resolve_alias(storage: Storage, needle: str) -> ResolutionResult | None:
    hit = storage.find_entity_by_alias(needle)
    if hit is None:
        return None
    return ResolutionResult(entity=hit, method="alias", score=0.95)


def _resolve_fuzzy(storage: Storage, needle: str) -> ResolutionResult | None:
    """RapidFuzz WRatio against every (name, alias) surface form."""
    entities = storage.all_entities()
    if not entities:
        return None
    scored: list[tuple[float, EntityRow]] = []
    for row in entities:
        candidates = [row.name, *row.aliases]
        best = 0.0
        for cand in candidates:
            if not cand:
                continue
            score = float(fuzz.WRatio(needle, cand))
            if score > best:
                best = score
        if best >= FUZZY_THRESHOLD:
            scored.append((best, row))
    if not scored:
        return None
    scored.sort(
        key=lambda pair: (
            -pair[0],
            pair[1].created_at.isoformat() if pair[1].created_at else pair[1].id,
        ),
    )
    scored = scored[:FUZZY_MAX_HITS]
    top_score, top_row = scored[0]
    return ResolutionResult(entity=top_row, method="fuzzy", score=top_score / 100.0)


def _resolve_embedding(
    storage: Storage,
    needle: str,
    *,
    embedder: Embedder | None,
    vector_searcher: VectorSearcher | None,
) -> ResolutionResult | None:
    """Cosine-similarity rung. Returns ``None`` when no candidate clears
    :data:`EMBEDDING_THRESHOLD` or when the embedder is opted out."""
    active_embedder = embedder if embedder is not None else get_embedder()
    if active_embedder is None:
        return None
    try:
        query = active_embedder.embed(needle)
    except Exception:
        logger.exception("embedding the needle failed; skipping embedding rung")
        return None

    searcher = vector_searcher
    if searcher is None:
        _ = vector_to_bytes(query)
        dim = int(query.shape[0])
        searcher = make_searcher(storage, dim=dim)

    hits = searcher.search(query, limit=EMBEDDING_MAX_HITS)
    if not hits:
        return None
    top = hits[0]
    if top.score < EMBEDDING_THRESHOLD:
        return None
    entity = storage.find_entity_by_id(top.entity_id)
    if entity is None:
        return None
    return ResolutionResult(entity=entity, method="embedding", score=top.score)
