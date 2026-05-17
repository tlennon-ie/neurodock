"""Embedding backend for v0.0.2 fuzzy-and-embedding entity recall.

Wraps :mod:`fastembed`'s small all-MiniLM-class model (``BAAI/bge-small-en-v1.5``
by default) behind a tiny, lazy-loading facade. The model is downloaded once
into the user's HuggingFace cache (``~/.cache/huggingface``) and reused from
disk on every subsequent run; the cognitive graph server itself does not make
network calls (see ADR 0002 section 9).

The backend is opt-out-able via the ``NEURODOCK_GRAPH_DISABLE_EMBEDDINGS``
environment variable. When disabled, :func:`get_embedder` returns ``None`` and
the resolution cascade skips its ``embedding`` rung; the fuzzy rung still
fires.

Embedding vectors are stored as raw little-endian float32 bytes in SQLite
BLOBs and truncated-then-renormalised to at most 256 dimensions to keep
storage bounded (see ``migrations/0002_embeddings.sql``).
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Protocol

import numpy as np
import numpy.typing as npt

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
"""Small (~33MB), high-quality MTEB-leaderboard model. 384 native dims;
truncated to :data:`MAX_DIM` before storage."""

MAX_DIM = 256
"""Hard cap on stored embedding dimensionality. Truncation keeps the
``entity_embeddings.vector`` BLOBs bounded at 1 KiB per row."""

OPT_OUT_ENV = "NEURODOCK_GRAPH_DISABLE_EMBEDDINGS"
"""Environment variable that, when set to a truthy value, disables
embedding-based resolution entirely. Useful for CI and offline systems."""


class Embedder(Protocol):
    """The contract for an object that can embed strings."""

    model_name: str

    def embed(self, text: str) -> npt.NDArray[np.float32]:
        """Return a unit-L2-normalised float32 vector for ``text``."""

    def embed_many(self, texts: list[str]) -> list[npt.NDArray[np.float32]]:
        """Embed a batch. Returns a list in the same order as the input."""


class _FastEmbedEmbedder:
    """Thin lazy wrapper around :class:`fastembed.TextEmbedding`."""

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        self.model_name = model_name
        self._model: object | None = None
        self._lock = threading.Lock()

    def _ensure_model(self) -> object:
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            from fastembed import TextEmbedding

            logger.info("loading embedding model name=%s", self.model_name)
            self._model = TextEmbedding(model_name=self.model_name)
            return self._model

    def embed(self, text: str) -> npt.NDArray[np.float32]:
        model = self._ensure_model()
        vectors = list(model.embed([text]))  # type: ignore[attr-defined]
        return _truncate_and_normalise(np.asarray(vectors[0], dtype=np.float32))

    def embed_many(self, texts: list[str]) -> list[npt.NDArray[np.float32]]:
        if not texts:
            return []
        model = self._ensure_model()
        vectors = list(model.embed(texts))  # type: ignore[attr-defined]
        return [_truncate_and_normalise(np.asarray(v, dtype=np.float32)) for v in vectors]


def _truncate_and_normalise(vec: npt.NDArray[np.float32]) -> npt.NDArray[np.float32]:
    """Truncate to :data:`MAX_DIM` and L2-normalise. Idempotent for vectors
    already at or below the cap."""
    if vec.shape[0] > MAX_DIM:
        vec = vec[:MAX_DIM]
    norm = float(np.linalg.norm(vec))
    if norm == 0.0:
        return vec
    return (vec / norm).astype(np.float32)


def vector_to_bytes(vec: npt.NDArray[np.float32]) -> bytes:
    """Pack a float32 vector into the on-disk byte representation."""
    return vec.astype(np.float32, copy=False).tobytes()


def vector_from_bytes(blob: bytes, dim: int) -> npt.NDArray[np.float32]:
    """Unpack a stored vector. ``dim`` must match the row's ``dim`` column."""
    vec = np.frombuffer(blob, dtype=np.float32, count=dim)
    return vec.copy()


def cosine_similarity(
    query: npt.NDArray[np.float32],
    candidate: npt.NDArray[np.float32],
) -> float:
    """Cosine similarity in ``[-1, 1]``. Both inputs assumed L2-normalised."""
    if query.shape != candidate.shape:
        return 0.0
    return float(np.dot(query, candidate))


def is_embedding_disabled() -> bool:
    """Return True if the operator has opted out via the env var."""
    raw = os.environ.get(OPT_OUT_ENV)
    if raw is None:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}


_DEFAULT_EMBEDDER: Embedder | None = None
_DEFAULT_EMBEDDER_LOCK = threading.Lock()


def get_embedder(model_name: str = DEFAULT_MODEL) -> Embedder | None:
    """Return a process-wide singleton embedder, or ``None`` if disabled.

    The first call loads the model lazily (next ``embed`` invocation). The
    singleton is shared across threads; fastembed is thread-safe for
    inference.
    """
    if is_embedding_disabled():
        logger.info("embeddings disabled via %s", OPT_OUT_ENV)
        return None
    global _DEFAULT_EMBEDDER
    if _DEFAULT_EMBEDDER is not None and _DEFAULT_EMBEDDER.model_name == model_name:
        return _DEFAULT_EMBEDDER
    with _DEFAULT_EMBEDDER_LOCK:
        if _DEFAULT_EMBEDDER is None or _DEFAULT_EMBEDDER.model_name != model_name:
            _DEFAULT_EMBEDDER = _FastEmbedEmbedder(model_name=model_name)
        return _DEFAULT_EMBEDDER


def reset_embedder_for_tests() -> None:
    """Test-only: drop the cached singleton so a fresh opt-out env can take
    effect. Production code never calls this."""
    global _DEFAULT_EMBEDDER
    with _DEFAULT_EMBEDDER_LOCK:
        _DEFAULT_EMBEDDER = None
