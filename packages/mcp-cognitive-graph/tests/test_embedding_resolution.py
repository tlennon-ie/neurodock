"""Embedding rung of the recall_entity resolution cascade.

We do NOT load the real fastembed model in CI: the first invocation would
download ~30MB which is both slow and flaky on offline runners. Instead
these tests inject a deterministic stub :class:`Embedder` that maps strings
to hand-tuned vectors so the rung's plumbing (cosine, threshold, ordering)
is exercised exhaustively without a model download.

A separate slow-marked test exercises the real fastembed model when the
``NEURODOCK_GRAPH_RUN_EMBEDDING_INTEGRATION`` env var is set.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import cast

import numpy as np
import numpy.typing as npt
import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.embedding_indexer import index_entity
from neurodock_mcp_cognitive_graph.embeddings import (
    OPT_OUT_ENV,
    cosine_similarity,
    get_embedder,
    is_embedding_disabled,
    reset_embedder_for_tests,
    vector_from_bytes,
    vector_to_bytes,
)
from neurodock_mcp_cognitive_graph.resolution import EMBEDDING_THRESHOLD, resolve
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact
from neurodock_mcp_cognitive_graph.vector_search import NumpySearcher


class StubEmbedder:
    """Deterministic test embedder.

    Each known surface maps to a fixed unit vector. Two strings are
    considered semantic neighbours if they share a "topic" in
    :attr:`topics`; everything else gets an orthogonal vector.
    """

    model_name = "stub-test-model"

    def __init__(self) -> None:
        # Three orthogonal basis directions in a 4-dim space; the fourth dim
        # is left as a small noise channel so non-topical strings stay below
        # the embedding threshold.
        self.topics: dict[str, npt.NDArray[np.float32]] = {
            "postgres": np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32),
            "kipi": np.array([0.0, 1.0, 0.0, 0.0], dtype=np.float32),
            "roberto": np.array([0.0, 0.0, 1.0, 0.0], dtype=np.float32),
        }

    def _topic_for(self, text: str) -> str | None:
        lowered = text.lower()
        if "postgres" in lowered or "postgre" in lowered or "pg" in lowered:
            return "postgres"
        if "kipi" in lowered:
            return "kipi"
        if "robert" in lowered:
            return "roberto"
        return None

    def embed(self, text: str) -> npt.NDArray[np.float32]:
        topic = self._topic_for(text)
        if topic is not None:
            base = self.topics[topic].copy()
        else:
            # An "off-topic" vector that is far from every basis direction.
            base = np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float32)
        # Normalise so cosine is well-defined.
        norm = float(np.linalg.norm(base))
        return cast(npt.NDArray[np.float32], (base / norm).astype(np.float32))

    def embed_many(self, texts: list[str]) -> list[npt.NDArray[np.float32]]:
        return [self.embed(t) for t in texts]


@pytest.fixture
def stub_embedder() -> StubEmbedder:
    return StubEmbedder()


def _seed_entity(
    storage: InMemoryStorage,
    clock: FixedClock,
    stub: StubEmbedder,
    *,
    etype: str,
    name: str,
) -> str:
    record_fact(
        storage,
        clock,
        subject={"type": etype, "name": name},
        predicate="tagged",
        object={"literal": "seeded"},
    )
    row = storage.find_entity_exact(etype, name)  # type: ignore[arg-type]
    assert row is not None
    # The record_fact call above auto-creates the entity but the
    # embedding_indexer write path requires get_embedder() which is the
    # fastembed singleton. We supply the stub embedder directly here so
    # the test does not download the real model.
    index_entity(storage, row, clock.now(), embedder=stub)
    return row.id


def test_semantic_neighbour_resolves(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
    stub_embedder: StubEmbedder,
) -> None:
    """'Postgres' resolves to a stored 'PostgreSQL' entity via the
    embedding rung when fuzzy is exhausted."""
    _seed_entity(memory_storage, fixed_clock, stub_embedder,
                 etype="concept", name="PostgreSQL")

    # We need to bypass the fuzzy rung; "Postgres" vs "PostgreSQL" is high
    # WRatio so it will actually win fuzzy. Test the embedding path with a
    # name that the stub considers a topical neighbour but is not a fuzzy
    # match.
    result = resolve(
        memory_storage,
        "Pg cluster team",
        embedder=stub_embedder,
        vector_searcher=NumpySearcher(memory_storage),
    )
    assert result.entity is not None
    assert result.entity.name == "PostgreSQL"
    assert result.method == "embedding"
    assert result.score >= EMBEDDING_THRESHOLD


def test_identical_string_has_unit_cosine() -> None:
    """A vector compared with itself is cosine 1.0 (modulo float)."""
    stub = StubEmbedder()
    v = stub.embed("Roberto")
    assert cosine_similarity(v, v) == pytest.approx(1.0, abs=1e-6)


def test_disjoint_strings_below_threshold() -> None:
    """Orthogonal topic vectors fall below the embedding threshold."""
    stub = StubEmbedder()
    a = stub.embed("Roberto")
    b = stub.embed("kipi-system")
    assert cosine_similarity(a, b) < EMBEDDING_THRESHOLD


def test_opt_out_disables_embedder() -> None:
    """Setting the opt-out env var causes :func:`get_embedder` to return
    ``None`` so the resolution cascade silently drops the embedding rung."""
    prev = os.environ.get(OPT_OUT_ENV)
    os.environ[OPT_OUT_ENV] = "1"
    reset_embedder_for_tests()
    try:
        assert is_embedding_disabled() is True
        assert get_embedder() is None
    finally:
        if prev is None:
            del os.environ[OPT_OUT_ENV]
        else:
            os.environ[OPT_OUT_ENV] = prev
        reset_embedder_for_tests()


def test_vector_byte_roundtrip() -> None:
    """Vectors survive a pack/unpack cycle to the on-disk BLOB format."""
    original = np.array([0.1, 0.2, 0.3, 0.4], dtype=np.float32)
    blob = vector_to_bytes(original)
    restored = vector_from_bytes(blob, dim=4)
    assert np.allclose(restored, original, atol=1e-7)


def test_numpy_searcher_returns_ordered_hits(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
    stub_embedder: StubEmbedder,
) -> None:
    """The NumPy searcher returns hits ordered by descending similarity."""
    _seed_entity(memory_storage, fixed_clock, stub_embedder,
                 etype="concept", name="PostgreSQL")
    _seed_entity(memory_storage, fixed_clock, stub_embedder,
                 etype="concept", name="kipi-system")

    query = stub_embedder.embed("postgres workload")
    searcher = NumpySearcher(memory_storage)
    hits = searcher.search(query, limit=5)
    assert hits  # at least one hit
    # First hit must be the Postgres entity at near-1 score.
    assert hits[0].surface_text == "PostgreSQL"
    assert hits[0].score > hits[-1].score or len(hits) == 1
