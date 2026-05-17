"""Resolution cascade ordering.

Each test sets up an ambiguous corpus and asserts which rung wins. The
cascade is documented as exact > alias > fuzzy > embedding; these tests
make that contract executable.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import numpy as np
import numpy.typing as npt
import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.embedding_indexer import index_entity
from neurodock_mcp_cognitive_graph.resolution import resolve
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact
from neurodock_mcp_cognitive_graph.vector_search import NumpySearcher


class TopicEmbedder:
    """Maps any input containing the substring 'shared' to one fixed vector,
    everything else to an orthogonal one. Used to force the embedding rung
    to match a specific entity in a controlled way."""

    model_name = "topic-stub"

    def _vec(self, text: str) -> npt.NDArray[np.float32]:
        if "shared" in text.lower():
            v = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        else:
            v = np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float32)
        return (v / float(np.linalg.norm(v))).astype(np.float32)

    def embed(self, text: str) -> npt.NDArray[np.float32]:
        return self._vec(text)

    def embed_many(self, texts: list[str]) -> list[npt.NDArray[np.float32]]:
        return [self._vec(t) for t in texts]


@pytest.fixture(autouse=True)
def _disable_default_embedder() -> Iterator[None]:
    """Off by default; tests that want the embedding rung pass an embedder
    explicitly via the resolve() kwarg."""
    prev = os.environ.get("NEURODOCK_GRAPH_DISABLE_EMBEDDINGS")
    os.environ["NEURODOCK_GRAPH_DISABLE_EMBEDDINGS"] = "1"
    try:
        yield
    finally:
        if prev is None:
            del os.environ["NEURODOCK_GRAPH_DISABLE_EMBEDDINGS"]
        else:
            os.environ["NEURODOCK_GRAPH_DISABLE_EMBEDDINGS"] = prev


def test_exact_wins_over_alias(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """When an exact name match exists, the cascade returns 'exact' even if
    another entity has the query as an alias."""
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Sam"},
        predicate="tagged",
        object={"literal": "team-a"},
    )
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Samuel"},
        predicate="tagged",
        object={"literal": "team-b"},
    )
    samuel = memory_storage.find_entity_exact("person", "Samuel")
    assert samuel is not None
    memory_storage.add_alias(samuel.id, "Sam")  # alias-collides with the other name

    result = resolve(memory_storage, "Sam")
    assert result.method == "exact"
    assert result.entity is not None
    assert result.entity.name == "Sam"


def test_alias_wins_over_fuzzy(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """An alias hit (case-insensitive) wins over a fuzzy match on a
    different entity."""
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="tagged",
        object={"literal": "core"},
    )
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kupi-syztem"},  # fuzzy-close
        predicate="tagged",
        object={"literal": "rival"},
    )
    kipi = memory_storage.find_entity_exact("project", "kipi-system")
    assert kipi is not None
    memory_storage.add_alias(kipi.id, "KIPI")

    result = resolve(memory_storage, "kipi")  # case-insensitive alias hit
    assert result.method == "alias"
    assert result.entity is not None
    assert result.entity.name == "kipi-system"


def test_fuzzy_wins_over_embedding(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """A near-miss spelling is caught by fuzzy before the embedding rung
    runs. We seed an embedding-shaped match that would otherwise fire."""
    embedder = TopicEmbedder()
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Roberto"},
        predicate="tagged",
        object={"literal": "team"},
    )
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "shared-account"},
        predicate="tagged",
        object={"literal": "ops"},
    )
    shared = memory_storage.find_entity_exact("person", "shared-account")
    assert shared is not None
    index_entity(memory_storage, shared, fixed_clock.now(), embedder=embedder)

    # "Robrto" -> fuzzy on Roberto, NOT embedding on shared-account.
    result = resolve(
        memory_storage,
        "Robrto",
        embedder=embedder,
        vector_searcher=NumpySearcher(memory_storage),
    )
    assert result.method == "fuzzy"
    assert result.entity is not None
    assert result.entity.name == "Roberto"


def test_embedding_fires_when_all_higher_rungs_miss(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """Verifies the embedding rung is reached when exact / alias / fuzzy
    all fail to produce a hit."""
    embedder = TopicEmbedder()
    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "shared-account"},
        predicate="tagged",
        object={"literal": "ops"},
    )
    shared = memory_storage.find_entity_exact("person", "shared-account")
    assert shared is not None
    index_entity(memory_storage, shared, fixed_clock.now(), embedder=embedder)

    # An input that triggers the embedder's "shared" topic but is far in
    # WRatio space from any stored surface ("shared-account" vs "team using
    # shared infra" is below fuzzy threshold).
    result = resolve(
        memory_storage,
        "team using shared infra",
        embedder=embedder,
        vector_searcher=NumpySearcher(memory_storage),
    )
    assert result.method == "embedding"
    assert result.entity is not None
    assert result.entity.name == "shared-account"


def test_short_circuit_does_not_call_lower_rungs(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """If exact wins, we should never invoke the embedder. We pass an
    embedder that raises on call to verify."""

    class ExplodingEmbedder:
        model_name = "explode"

        def embed(self, text: str) -> npt.NDArray[np.float32]:
            raise AssertionError("embedding rung was reached")

        def embed_many(
            self, texts: list[str]
        ) -> list[npt.NDArray[np.float32]]:
            raise AssertionError("embedding rung was reached")

    record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Priya"},
        predicate="tagged",
        object={"literal": "lead"},
    )
    result = resolve(
        memory_storage,
        "Priya",
        embedder=ExplodingEmbedder(),
    )
    assert result.method == "exact"
    assert result.entity is not None
    assert result.entity.name == "Priya"
