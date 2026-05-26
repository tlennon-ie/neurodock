# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Nearest-neighbour search over stored entity embeddings.

Two execution paths produce identical results for the test corpus:

* :class:`SqliteVecSearcher` — when the optional :mod:`sqlite_vec` extension
  loads, run cosine search inside SQLite against a ``vec0`` virtual table.
* :class:`NumpySearcher` — pure NumPy cosine over the full
  ``entity_embeddings`` table. Used when sqlite-vec is unavailable, or for
  the in-memory storage backing used by tests.

The searcher is selected lazily by :func:`make_searcher` based on the storage
type and on whether ``sqlite_vec`` is importable; callers receive a single
``search`` method either way.
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass
from typing import Protocol

import numpy as np
import numpy.typing as npt

from neurodock_mcp_cognitive_graph.embeddings import (
    cosine_similarity,
    vector_from_bytes,
)
from neurodock_mcp_cognitive_graph.storage.base import EmbeddingRow, Storage

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VectorHit:
    """One nearest-neighbour result."""

    entity_id: str
    surface_text: str
    score: float  # cosine similarity in [0, 1] after clamping


class VectorSearcher(Protocol):
    """The contract every nearest-neighbour backend must satisfy."""

    def search(
        self,
        query: npt.NDArray[np.float32],
        limit: int = 10,
    ) -> list[VectorHit]:
        """Return up to ``limit`` neighbours ordered by similarity desc."""


class NumpySearcher:
    """Storage-agnostic fallback. Iterates the full embedding table."""

    def __init__(self, storage: Storage) -> None:
        self._storage = storage

    def search(
        self,
        query: npt.NDArray[np.float32],
        limit: int = 10,
    ) -> list[VectorHit]:
        rows: list[EmbeddingRow] = self._storage.all_embeddings()
        if not rows:
            return []
        scored: list[VectorHit] = []
        for row in rows:
            try:
                candidate = vector_from_bytes(row.vector, row.dim)
            except ValueError:
                # A row with a mismatched dim is a stale model artefact; skip.
                logger.warning(
                    "skipping embedding with bad shape entity=%s",
                    row.entity_id,
                )
                continue
            sim = cosine_similarity(query, candidate)
            # Clamp negative cosines to zero; the schema requires score in [0,1].
            clamped = max(0.0, min(1.0, sim))
            scored.append(
                VectorHit(
                    entity_id=row.entity_id,
                    surface_text=row.surface_text,
                    score=clamped,
                )
            )
        scored.sort(key=lambda h: h.score, reverse=True)
        return scored[:limit]


class SqliteVecSearcher:
    """sqlite-vec backed cosine search.

    Builds (or reuses) a transient ``vec0`` virtual table in the same SQLite
    connection used by :class:`SQLiteStorage`. The virtual table is populated
    on demand from ``entity_embeddings`` and refreshed lazily based on a
    last-touched bookkeeping table; for the v0.0.2 scale (low thousands of
    entities) a rebuild on first query is acceptable.
    """

    def __init__(self, conn: sqlite3.Connection, dim: int) -> None:
        self._conn = conn
        self._dim = dim
        self._ready = False

    def _ensure_table(self) -> None:
        if self._ready:
            return
        # Confirm sqlite_vec is loaded; load_extension is a no-op if already.
        # The caller is expected to have loaded the extension on the
        # connection before constructing this searcher. We only create the
        # virtual table here.
        self._conn.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS vec_entity_embeddings "
            f"USING vec0(embedding float[{self._dim}])"
        )
        # Resync rows. For low thousands this is cheap; we trade simplicity
        # for the marginal speedup of an incremental sync.
        self._conn.execute("DELETE FROM vec_entity_embeddings")
        cur = self._conn.execute(
            "SELECT rowid, vector FROM entity_embeddings WHERE dim = ?",
            (self._dim,),
        )
        rows = cur.fetchall()
        for r in rows:
            self._conn.execute(
                "INSERT INTO vec_entity_embeddings(rowid, embedding) VALUES (?, ?)",
                (r[0], r[1]),
            )
        self._conn.commit()
        self._ready = True

    def search(
        self,
        query: npt.NDArray[np.float32],
        limit: int = 10,
    ) -> list[VectorHit]:
        self._ensure_table()
        query_bytes = query.astype(np.float32, copy=False).tobytes()
        cur = self._conn.execute(
            "SELECT e.entity_id, e.surface_text, v.distance "
            "FROM vec_entity_embeddings v "
            "JOIN entity_embeddings e ON e.rowid = v.rowid "
            "WHERE v.embedding MATCH ? "
            "ORDER BY v.distance ASC LIMIT ?",
            (query_bytes, limit),
        )
        out: list[VectorHit] = []
        for r in cur.fetchall():
            # sqlite-vec returns L2 distance by default. Both query and
            # stored vectors are unit-normalised, so cosine = 1 - L2^2 / 2.
            distance = float(r[2])
            sim = 1.0 - (distance * distance) / 2.0
            clamped = max(0.0, min(1.0, sim))
            out.append(
                VectorHit(
                    entity_id=r[0],
                    surface_text=r[1],
                    score=clamped,
                )
            )
        return out


def try_load_sqlite_vec(conn: sqlite3.Connection) -> bool:
    """Attempt to load sqlite-vec onto a SQLite connection.

    Returns ``True`` when the extension is available and loaded, ``False``
    otherwise. The caller falls back to :class:`NumpySearcher` on False.
    """
    try:
        import sqlite_vec
    except ImportError:
        logger.info("sqlite_vec not installed; using NumPy fallback for vector search")
        return False
    try:
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        return True
    except (sqlite3.OperationalError, AttributeError) as exc:
        # AttributeError covers builds of CPython on Windows where
        # enable_load_extension is intentionally missing.
        logger.warning("failed to load sqlite_vec extension; falling back: %s", exc)
        return False


def make_searcher(storage: Storage, dim: int) -> VectorSearcher:
    """Construct the best available searcher for the given storage.

    Falls back to :class:`NumpySearcher` whenever ``sqlite_vec`` cannot be
    loaded or the storage is not SQLite-backed.
    """
    # Avoid a hard import dependency on storage.sqlite to keep this module
    # importable from environments that ship the in-memory backing only.
    sqlite_conn = getattr(storage, "_conn", None)
    if isinstance(sqlite_conn, sqlite3.Connection) and try_load_sqlite_vec(sqlite_conn):
        return SqliteVecSearcher(sqlite_conn, dim=dim)
    return NumpySearcher(storage)
