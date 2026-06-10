# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Behavioural parity tests for :class:`LibSqlStorage`.

The libSQL backing (ADR 0010 Phases C/D) must behave identically to
:class:`SQLiteStorage` on the same operations: libSQL is a SQLite fork, so the
SQL dialect and the on-disk embedding BLOB layout match, and the same NumPy
cosine fallback reads embedding rows out of it unchanged.

These tests open a **local** ``file:`` libSQL database in a tmp path — no
server, no network, no infra. They are skipped automatically if the optional
``libsql`` client cannot be imported in this environment, so the suite never
fakes a pass.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest
from neurodock_mcp_cognitive_graph.embeddings import vector_from_bytes, vector_to_bytes
from neurodock_mcp_cognitive_graph.storage.sqlite import SQLiteStorage
from neurodock_mcp_cognitive_graph.vector_search import NumpySearcher

# Skip the whole module if the optional libsql client is unavailable. This is
# honest: when libsql is not installed (e.g. a default local stdio environment)
# the live tests do not run and are reported as skipped rather than passed.
libsql = pytest.importorskip("libsql", reason="optional 'libsql' client not installed")

from neurodock_mcp_cognitive_graph.storage.libsql import (  # noqa: E402  (after importorskip)
    LibSqlStorage,
    _iter_migration_resources,
    _split_sql_statements,
)

NOW = datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC)


@pytest.fixture
def libsql_storage(tmp_path: Path) -> Iterator[LibSqlStorage]:
    """A fresh local libSQL store anchored at a tmp-path file."""
    db_path = tmp_path / "test-cognitive-graph.libsql.db"
    storage = LibSqlStorage(str(db_path))
    storage.initialise()
    try:
        yield storage
    finally:
        storage.close()


# -- construction / schema -------------------------------------------------


def test_initialise_creates_schema(tmp_path: Path) -> None:
    """A fresh database picks up both migrations on first initialise."""
    db_path = tmp_path / "schema.libsql.db"
    storage = LibSqlStorage(str(db_path))
    storage.initialise()
    try:
        # All four query surfaces should work against the empty schema.
        assert storage.all_entities() == []
        assert storage.all_decision_entities() == []
        assert storage.all_embeddings() == []
        assert storage.get_cached_resolution("nothing") is None
    finally:
        storage.close()


def test_query_before_initialise_raises(tmp_path: Path) -> None:
    """Touching storage before initialise() is a programmer error."""
    storage = LibSqlStorage(str(tmp_path / "uninit.db"))
    with pytest.raises(RuntimeError, match="not initialised"):
        storage.all_entities()


def test_auth_token_is_threaded_only_when_present(tmp_path: Path) -> None:
    """A local file connection must still work when no auth token is given.

    (The remote ``libsql://`` path threads the token through; we assert the
    None branch here since a live remote server is out of scope for unit tests.)
    """
    storage = LibSqlStorage(str(tmp_path / "noauth.db"), auth_token=None)
    storage.initialise()
    try:
        entity, created = storage.upsert_entity("person", "Ada", now=NOW)
        assert created is True
        assert entity.name == "Ada"
    finally:
        storage.close()


# -- entities --------------------------------------------------------------


def test_upsert_entity_inserts_then_fetches(libsql_storage: LibSqlStorage) -> None:
    row, created = libsql_storage.upsert_entity("person", "Roberto", now=NOW)
    assert created is True
    assert row.name == "Roberto"
    assert row.type == "person"
    assert row.aliases == ()

    # Second upsert of the same (type, name) returns the existing row.
    row2, created2 = libsql_storage.upsert_entity("person", "Roberto", now=NOW)
    assert created2 is False
    assert row2.id == row.id


def test_find_entity_by_id(libsql_storage: LibSqlStorage) -> None:
    row, _ = libsql_storage.upsert_entity("project", "kipi-system", now=NOW)
    found = libsql_storage.find_entity_by_id(row.id)
    assert found is not None
    assert found.name == "kipi-system"
    assert libsql_storage.find_entity_by_id("ent_does_not_exist") is None


def test_find_entity_exact_and_any_type(libsql_storage: LibSqlStorage) -> None:
    libsql_storage.upsert_entity("person", "Priya", now=NOW)
    assert libsql_storage.find_entity_exact("person", "Priya") is not None
    assert libsql_storage.find_entity_exact("project", "Priya") is None
    assert libsql_storage.find_entity_by_name_any_type("Priya") is not None
    assert libsql_storage.find_entity_by_name_any_type("Nobody") is None


def test_alias_add_and_resolve(libsql_storage: LibSqlStorage) -> None:
    row, _ = libsql_storage.upsert_entity("person", "Roberto", now=NOW)
    libsql_storage.add_alias(row.id, "Rob")
    libsql_storage.add_alias(row.id, "Bobby")
    # Idempotent: adding the same alias twice is a no-op.
    libsql_storage.add_alias(row.id, "Rob")
    # Adding the canonical name as an alias is a no-op.
    libsql_storage.add_alias(row.id, "Roberto")

    refetched = libsql_storage.find_entity_by_id(row.id)
    assert refetched is not None
    assert refetched.aliases == ("Rob", "Bobby")

    # Case-insensitive alias resolution.
    by_alias = libsql_storage.find_entity_by_alias("bobby")
    assert by_alias is not None
    assert by_alias.id == row.id
    # Exact-name (case-insensitive) wins too.
    by_name = libsql_storage.find_entity_by_alias("ROBERTO")
    assert by_name is not None
    assert by_name.id == row.id
    # An unknown alias resolves to nothing.
    assert libsql_storage.find_entity_by_alias("Zephyrine") is None


# -- facts -----------------------------------------------------------------


def _seed_fact(
    storage: LibSqlStorage,
    *,
    subject: tuple[str, str],
    predicate: str,
    obj_entity: tuple[str, str] | None = None,
    obj_literal: str | None = None,
    source: str | None = None,
    confidence: float = 1.0,
) -> str:
    """Create the entities and the canonical fact, returning the fact id."""
    from neurodock_mcp_cognitive_graph.storage.libsql import _new_entity_id

    subj, _ = storage.upsert_entity(subject[0], subject[1], now=NOW)  # type: ignore[arg-type]
    object_id: str | None = None
    object_kind = "literal"
    if obj_entity is not None:
        obj, _ = storage.upsert_entity(obj_entity[0], obj_entity[1], now=NOW)  # type: ignore[arg-type]
        object_id = obj.id
        object_kind = "entity"
    fact_id = _new_entity_id().replace("ent_", "fact_")
    from neurodock_mcp_cognitive_graph.storage.base import FactRow

    fact = FactRow(
        id=fact_id,
        subject_id=subj.id,
        predicate=predicate,  # type: ignore[arg-type]
        object_kind=object_kind,
        object_id=object_id,
        object_literal=obj_literal,
        source=source,
        confidence=confidence,
        recorded_at=NOW,
    )
    storage.insert_fact(fact)
    return fact_id


def test_insert_and_find_canonical_fact(libsql_storage: LibSqlStorage) -> None:
    fact_id = _seed_fact(
        libsql_storage,
        subject=("person", "Roberto"),
        predicate="decided_in",
        obj_entity=("decision", "Adopt SQLite"),
        source="msg://slack/C1/p1",
    )
    subj = libsql_storage.find_entity_exact("person", "Roberto")
    obj = libsql_storage.find_entity_exact("decision", "Adopt SQLite")
    assert subj is not None and obj is not None
    found = libsql_storage.find_fact_canonical(subj.id, "decided_in", obj.id, None)
    assert found is not None
    assert found.id == fact_id
    assert found.source == "msg://slack/C1/p1"
    assert found.confidence == 1.0


def test_provenance_insert(libsql_storage: LibSqlStorage) -> None:
    fact_id = _seed_fact(
        libsql_storage,
        subject=("project", "neurodock"),
        predicate="blocked_by",
        obj_literal="awaiting advisor",
    )
    # Should not raise; provenance is append-only.
    libsql_storage.insert_provenance(fact_id, "msg://slack/C2/p9", 0.9, NOW)


def test_facts_touching_entity_and_truncation(libsql_storage: LibSqlStorage) -> None:
    subj, _ = libsql_storage.upsert_entity("project", "neurodock", now=NOW)
    from neurodock_mcp_cognitive_graph.storage.base import FactRow

    for i in range(3):
        libsql_storage.insert_fact(
            FactRow(
                id=f"fact_t{i}",
                subject_id=subj.id,
                predicate="tagged",
                object_kind="literal",
                object_id=None,
                object_literal=f"tag-{i}",
                source=None,
                confidence=1.0,
                recorded_at=NOW,
            )
        )
    rows, truncated = libsql_storage.facts_touching_entity(subj.id, limit=10)
    assert len(rows) == 3
    assert truncated is False

    rows2, truncated2 = libsql_storage.facts_touching_entity(subj.id, limit=2)
    assert len(rows2) == 2
    assert truncated2 is True


def test_neighbour_counts(libsql_storage: LibSqlStorage) -> None:
    _seed_fact(
        libsql_storage,
        subject=("project", "neurodock"),
        predicate="depends_on",
        obj_entity=("concept", "sqlite-vec"),
    )
    _seed_fact(
        libsql_storage,
        subject=("project", "neurodock"),
        predicate="tagged",
        obj_entity=("concept", "memory"),
    )
    nd = libsql_storage.find_entity_exact("project", "neurodock")
    assert nd is not None
    counts = libsql_storage.neighbour_counts(nd.id, limit=10)
    assert len(counts) == 2
    assert all(c == 1 for _, c in counts)


def test_facts_by_predicate_with_since(libsql_storage: LibSqlStorage) -> None:
    subj, _ = libsql_storage.upsert_entity("project", "neurodock", now=NOW)
    from neurodock_mcp_cognitive_graph.storage.base import FactRow

    old = datetime(2026, 4, 1, tzinfo=UTC)
    libsql_storage.insert_fact(
        FactRow(
            id="fact_old",
            subject_id=subj.id,
            predicate="blocked_by",
            object_kind="literal",
            object_id=None,
            object_literal="old blocker",
            source=None,
            confidence=1.0,
            recorded_at=old,
        )
    )
    libsql_storage.insert_fact(
        FactRow(
            id="fact_new",
            subject_id=subj.id,
            predicate="blocked_by",
            object_kind="literal",
            object_id=None,
            object_literal="new blocker",
            source=None,
            confidence=1.0,
            recorded_at=NOW,
        )
    )
    all_blockers = libsql_storage.facts_by_predicate("blocked_by")
    assert len(all_blockers) == 2
    recent = libsql_storage.facts_by_predicate("blocked_by", since=datetime(2026, 5, 1, tzinfo=UTC))
    assert len(recent) == 1
    assert recent[0].object_literal == "new blocker"


# -- decisions -------------------------------------------------------------


def test_decisions_for_project(libsql_storage: LibSqlStorage) -> None:
    _seed_fact(
        libsql_storage,
        subject=("project", "neurodock"),
        predicate="decided_in",
        obj_entity=("decision", "Ship rumination detector first"),
    )
    nd = libsql_storage.find_entity_exact("project", "neurodock")
    assert nd is not None
    decisions = libsql_storage.decisions_for_project(nd.id)
    assert len(decisions) == 1
    assert decisions[0].name == "Ship rumination detector first"
    assert decisions[0].type == "decision"

    project_facts = libsql_storage.facts_for_project_decisions(nd.id)
    assert len(project_facts) == 1

    all_decisions = libsql_storage.all_decision_entities()
    assert len(all_decisions) == 1


# -- embeddings / vector round-trip ---------------------------------------


def test_embedding_roundtrip_and_upsert(libsql_storage: LibSqlStorage) -> None:
    entity, _ = libsql_storage.upsert_entity("person", "Roberto", now=NOW)
    vec = np.array([0.1, 0.2, 0.3, 0.4], dtype=np.float32)
    blob = vector_to_bytes(vec)
    libsql_storage.upsert_embedding(
        entity_id=entity.id,
        surface_kind="name",
        surface_text="Roberto",
        vector=blob,
        dim=4,
        model="stub",
        now=NOW,
    )
    rows = libsql_storage.all_embeddings()
    assert len(rows) == 1
    assert rows[0].entity_id == entity.id
    assert rows[0].vector == blob
    restored = vector_from_bytes(rows[0].vector, rows[0].dim)
    assert np.allclose(restored, vec, atol=1e-7)

    # Upsert with a new vector replaces in place (no duplicate row).
    vec2 = np.array([0.4, 0.3, 0.2, 0.1], dtype=np.float32)
    libsql_storage.upsert_embedding(
        entity_id=entity.id,
        surface_kind="name",
        surface_text="Roberto",
        vector=vector_to_bytes(vec2),
        dim=4,
        model="stub",
        now=NOW,
    )
    rows2 = libsql_storage.all_embeddings()
    assert len(rows2) == 1
    assert np.allclose(vector_from_bytes(rows2[0].vector, rows2[0].dim), vec2, atol=1e-7)


def test_delete_embeddings_for_entity(libsql_storage: LibSqlStorage) -> None:
    entity, _ = libsql_storage.upsert_entity("person", "Roberto", now=NOW)
    libsql_storage.upsert_embedding(
        entity_id=entity.id,
        surface_kind="name",
        surface_text="Roberto",
        vector=vector_to_bytes(np.array([1.0, 0.0], dtype=np.float32)),
        dim=2,
        model="stub",
        now=NOW,
    )
    assert len(libsql_storage.all_embeddings()) == 1
    libsql_storage.delete_embeddings_for_entity(entity.id)
    assert libsql_storage.all_embeddings() == []


def test_numpy_searcher_over_libsql(libsql_storage: LibSqlStorage) -> None:
    """The storage-agnostic NumPy searcher works over a libSQL backing,
    proving the embedding-BLOB layout matches what the searcher expects."""
    pg, _ = libsql_storage.upsert_entity("concept", "PostgreSQL", now=NOW)
    kp, _ = libsql_storage.upsert_entity("concept", "kipi-system", now=NOW)
    libsql_storage.upsert_embedding(
        entity_id=pg.id,
        surface_kind="name",
        surface_text="PostgreSQL",
        vector=vector_to_bytes(np.array([1.0, 0.0, 0.0], dtype=np.float32)),
        dim=3,
        model="stub",
        now=NOW,
    )
    libsql_storage.upsert_embedding(
        entity_id=kp.id,
        surface_kind="name",
        surface_text="kipi-system",
        vector=vector_to_bytes(np.array([0.0, 1.0, 0.0], dtype=np.float32)),
        dim=3,
        model="stub",
        now=NOW,
    )
    searcher = NumpySearcher(libsql_storage)
    query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    hits = searcher.search(query, limit=5)
    assert hits
    assert hits[0].surface_text == "PostgreSQL"
    assert hits[0].score == pytest.approx(1.0, abs=1e-6)


# -- resolution cache ------------------------------------------------------


def test_resolution_cache_roundtrip(libsql_storage: LibSqlStorage) -> None:
    entity, _ = libsql_storage.upsert_entity("person", "Roberto", now=NOW)
    libsql_storage.cache_resolution(
        input_text="Robrto",
        entity_id=entity.id,
        method="fuzzy",
        score=0.86,
        now=NOW,
    )
    hit = libsql_storage.get_cached_resolution("Robrto")
    assert hit is not None
    cached_id, method, score = hit
    assert cached_id == entity.id
    assert method == "fuzzy"
    assert score == pytest.approx(0.86)

    # Upsert: the same input text updates rather than duplicates.
    libsql_storage.cache_resolution(
        input_text="Robrto",
        entity_id=entity.id,
        method="embedding",
        score=0.91,
        now=NOW,
    )
    hit2 = libsql_storage.get_cached_resolution("Robrto")
    assert hit2 is not None
    assert hit2[1] == "embedding"
    assert hit2[2] == pytest.approx(0.91)


# -- cross-backend parity --------------------------------------------------


def _exercise_backend(storage: SQLiteStorage | LibSqlStorage) -> dict[str, object]:
    """Run an identical operation sequence and snapshot observable results.

    The returned dict is compared between the SQLite and libSQL backings to
    prove behavioural parity (entity ids differ by construction, so we compare
    names/structure, not the random ids).
    """
    from neurodock_mcp_cognitive_graph.storage.base import FactRow

    roberto, _ = storage.upsert_entity("person", "Roberto", now=NOW)
    storage.add_alias(roberto.id, "Rob")
    priya, _ = storage.upsert_entity("person", "Priya", now=NOW)
    nd, _ = storage.upsert_entity("project", "neurodock", now=NOW)
    decision, _ = storage.upsert_entity("decision", "Ship rumination detector first", now=NOW)

    storage.insert_fact(
        FactRow(
            id="fact_p1",
            subject_id=roberto.id,
            predicate="reports_to",
            object_kind="entity",
            object_id=priya.id,
            object_literal=None,
            source=None,
            confidence=1.0,
            recorded_at=NOW,
        )
    )
    storage.insert_fact(
        FactRow(
            id="fact_p2",
            subject_id=nd.id,
            predicate="decided_in",
            object_kind="entity",
            object_id=decision.id,
            object_literal=None,
            source="msg://x",
            confidence=1.0,
            recorded_at=NOW,
        )
    )
    storage.insert_fact(
        FactRow(
            id="fact_p3",
            subject_id=nd.id,
            predicate="blocked_by",
            object_kind="literal",
            object_id=None,
            object_literal="awaiting advisor",
            source=None,
            confidence=0.9,
            recorded_at=NOW,
        )
    )

    # Embedding + NumPy search snapshot.
    storage.upsert_embedding(
        entity_id=roberto.id,
        surface_kind="name",
        surface_text="Roberto",
        vector=vector_to_bytes(np.array([1.0, 0.0, 0.0], dtype=np.float32)),
        dim=3,
        model="stub",
        now=NOW,
    )
    searcher = NumpySearcher(storage)
    top = searcher.search(np.array([1.0, 0.0, 0.0], dtype=np.float32), limit=1)

    facts_touching, truncated = storage.facts_touching_entity(nd.id)
    return {
        "alias_resolves": storage.find_entity_by_alias("rob") is not None,
        "decisions": sorted(d.name for d in storage.decisions_for_project(nd.id)),
        "blockers": sorted(
            f.object_literal or "" for f in storage.facts_by_predicate("blocked_by")
        ),
        "neighbour_count": len(storage.neighbour_counts(nd.id)),
        "facts_touching_nd": sorted(f.predicate for f in facts_touching),
        "facts_touching_truncated": truncated,
        "top_hit_surface": top[0].surface_text if top else None,
        "entity_count": len(storage.all_entities()),
    }


def test_libsql_matches_sqlite_on_same_operations(tmp_path: Path) -> None:
    """``LibSqlStorage`` produces identical observable results to
    ``SQLiteStorage`` for the same sequence of operations."""
    sqlite_store = SQLiteStorage(tmp_path / "parity.sqlite")
    sqlite_store.initialise()
    libsql_store = LibSqlStorage(str(tmp_path / "parity.libsql.db"))
    libsql_store.initialise()
    try:
        sqlite_snapshot = _exercise_backend(sqlite_store)
        libsql_snapshot = _exercise_backend(libsql_store)
        assert libsql_snapshot == sqlite_snapshot
    finally:
        sqlite_store.close()
        libsql_store.close()


# -- migration robustness over a remote-style connection ------------------


def test_split_sql_statements_keeps_inline_comment_semicolons_intact() -> None:
    """The facts CREATE TABLE has an inline comment containing a semicolon
    (``-- nullable; populated``). The splitter must not break the statement
    there, or the migration would apply a truncated, invalid CREATE."""
    statements = [s for sql in _iter_migration_resources() for s in _split_sql_statements(sql)]
    facts_create = [s for s in statements if s.startswith("CREATE TABLE IF NOT EXISTS facts (")]
    assert len(facts_create) == 1
    # The whole facts definition survived in one statement — the inline-comment
    # semicolon did not truncate it.
    assert "object_kind" in facts_create[0]
    assert "recorded_at" in facts_create[0]
    assert facts_create[0].rstrip().endswith(")")


class _PragmaRejectingConn:
    """A connection that rejects PRAGMA statements, like remote libSQL/Turso.

    Backed by stdlib sqlite3 so the DDL actually runs; any ``PRAGMA`` raises,
    reproducing the hosted-only failure where ``executescript`` halted on the
    schema's leading PRAGMAs and created no tables (Bug B, the missing
    ``entities``/``facts`` tables on hosted storage).
    """

    def __init__(self) -> None:
        import sqlite3

        self._c = sqlite3.connect(":memory:")

    def execute(self, sql: str, params: tuple = ()):  # type: ignore[no-untyped-def]
        if sql.lstrip().upper().startswith("PRAGMA"):
            raise RuntimeError("PRAGMA not supported on this remote backend")
        return self._c.execute(sql, params)

    def commit(self) -> None:
        self._c.commit()

    def table_names(self) -> set[str]:
        rows = self._c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        return {r[0] for r in rows}


def test_migrations_apply_when_pragmas_are_rejected() -> None:
    """Regression for hosted storage (Bug B): the full schema must be created
    even when the backend rejects the leading PRAGMAs, as remote Turso does."""
    storage = LibSqlStorage("ignored://remote")
    storage._conn = _PragmaRejectingConn()  # inject the remote-style connection
    storage._apply_migrations()
    tables = storage._conn.table_names()  # type: ignore[attr-defined]
    assert {"entities", "facts", "fact_provenance", "entity_embeddings"} <= tables
