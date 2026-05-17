"""Migration 0002 sanity checks.

The migration applier in :class:`SQLiteStorage` runs every ``NNNN_*.sql``
file in lexical order on each connection initialise, so any v0.0.1 database
will pick up ``0002_embeddings.sql`` the next time it is opened. These
tests pin that behaviour.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from neurodock_mcp_cognitive_graph import __schema_version__
from neurodock_mcp_cognitive_graph.storage.sqlite import SQLiteStorage


def _table_exists(db_path: Path, name: str) -> bool:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (name,),
        )
        return cur.fetchone() is not None
    finally:
        conn.close()


def test_schema_version_constant_is_2() -> None:
    """A trip-wire so future migrations remember to bump the constant."""
    assert __schema_version__ == 2


def test_fresh_db_has_both_migrations(tmp_path: Path) -> None:
    """A fresh database picks up both migrations on first initialise."""
    db_path = tmp_path / "fresh.sqlite"
    storage = SQLiteStorage(db_path)
    storage.initialise()
    try:
        assert _table_exists(db_path, "entities")  # from 0001
        assert _table_exists(db_path, "facts")  # from 0001
        assert _table_exists(db_path, "fact_provenance")  # from 0001
        assert _table_exists(db_path, "entity_embeddings")  # from 0002
        assert _table_exists(db_path, "entity_resolution_cache")  # from 0002
    finally:
        storage.close()


def test_existing_v0_0_1_db_upgrades_in_place(tmp_path: Path) -> None:
    """A database created by v0.0.1 (only 0001 applied) gains the new
    tables when reopened with v0.0.2 storage code."""
    db_path = tmp_path / "v001.sqlite"
    # Simulate a v0.0.1 database by running only the first migration.
    package_root = Path(__file__).resolve().parent.parent / "src" / "neurodock_mcp_cognitive_graph"
    migration_0001 = (package_root / "migrations" / "0001_init.sql").read_text(encoding="utf-8")
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(migration_0001)
        conn.commit()
    finally:
        conn.close()
    assert _table_exists(db_path, "entities")
    assert not _table_exists(db_path, "entity_embeddings")

    # Now open the same file with the v0.0.2 storage; it should run 0002.
    storage = SQLiteStorage(db_path)
    storage.initialise()
    try:
        assert _table_exists(db_path, "entity_embeddings")
        assert _table_exists(db_path, "entity_resolution_cache")
        # Critical: existing entities and facts are intact.
        # We did not insert any in the v0.0.1 prep step, but the table
        # itself must still exist and be queryable.
        assert storage.all_entities() == []
    finally:
        storage.close()


def test_upsert_embedding_roundtrips(tmp_path: Path) -> None:
    """A row written via :meth:`upsert_embedding` survives a reopen."""
    db_path = tmp_path / "embed.sqlite"
    storage = SQLiteStorage(db_path)
    storage.initialise()
    now = datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC)
    entity, _ = storage.upsert_entity("person", "Roberto", now=now)
    payload = b"\x00\x01\x02\x03" * 16  # 64 bytes; pretend 16-dim float32
    storage.upsert_embedding(
        entity_id=entity.id,
        surface_kind="name",
        surface_text="Roberto",
        vector=payload,
        dim=16,
        model="stub",
        now=now,
    )
    rows = storage.all_embeddings()
    assert len(rows) == 1
    assert rows[0].entity_id == entity.id
    assert rows[0].surface_text == "Roberto"
    assert rows[0].vector == payload
    storage.close()

    # Reopen; row must still be there.
    storage2 = SQLiteStorage(db_path)
    storage2.initialise()
    try:
        rows2 = storage2.all_embeddings()
        assert len(rows2) == 1
        assert rows2[0].vector == payload
    finally:
        storage2.close()


def test_resolution_cache_roundtrips(tmp_path: Path) -> None:
    """The resolution cache survives reads and writes."""
    db_path = tmp_path / "cache.sqlite"
    storage = SQLiteStorage(db_path)
    storage.initialise()
    now = datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC)
    entity, _ = storage.upsert_entity("person", "Roberto", now=now)
    storage.cache_resolution(
        input_text="Robrto",
        entity_id=entity.id,
        method="fuzzy",
        score=0.86,
        now=now,
    )
    hit = storage.get_cached_resolution("Robrto")
    assert hit is not None
    cached_id, method, score = hit
    assert cached_id == entity.id
    assert method == "fuzzy"
    assert score == 0.86
    storage.close()
