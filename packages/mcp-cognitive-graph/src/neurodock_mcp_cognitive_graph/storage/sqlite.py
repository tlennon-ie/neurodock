"""Synchronous SQLite-backed storage for the cognitive graph.

The store lives at ``~/.neurodock/cognitive-graph.sqlite`` by default and is
overridable via the ``NEURODOCK_GRAPH_DB_PATH`` environment variable. The
parent directory is created on first use.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterable
from datetime import datetime
from importlib import resources
from pathlib import Path
from typing import cast

from neurodock_mcp_cognitive_graph.storage.base import (
    DEFAULT_FACTS_CAP,
    DEFAULT_RELATED_CAP,
    EmbeddingRow,
    EntityRow,
    FactRow,
    SurfaceKind,
)
from neurodock_mcp_cognitive_graph.types import EntityType, Predicate

MIGRATIONS_PACKAGE = "neurodock_mcp_cognitive_graph.migrations"


def _new_entity_id() -> str:
    return f"ent_{uuid.uuid4().hex[:24]}"


def _row_to_entity(row: sqlite3.Row) -> EntityRow:
    aliases_raw = row["aliases"]
    aliases = tuple(json.loads(aliases_raw)) if aliases_raw else ()
    created_at_raw = row["created_at"]
    created_at = datetime.fromisoformat(created_at_raw) if created_at_raw else None
    return EntityRow(
        id=row["id"],
        type=cast(EntityType, row["type"]),
        name=row["name"],
        aliases=aliases,
        created_at=created_at,
    )


def _row_to_fact(row: sqlite3.Row) -> FactRow:
    return FactRow(
        id=row["id"],
        subject_id=row["subject_id"],
        predicate=cast(Predicate, row["predicate"]),
        object_kind=row["object_kind"],
        object_id=row["object_id"],
        object_literal=row["object_literal"],
        source=row["source"],
        confidence=float(row["confidence"]),
        recorded_at=datetime.fromisoformat(row["recorded_at"]),
    )


class SQLiteStorage:
    """File-backed SQLite store. Synchronous; safe for the FastMCP loop."""

    def __init__(self, db_path: Path | str) -> None:
        self._db_path = Path(db_path)
        self._conn: sqlite3.Connection | None = None

    # -- lifecycle --------------------------------------------------------

    def initialise(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False so the FastMCP worker can call us from a
        # different thread than the one we were constructed on.
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._apply_migrations()

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def _apply_migrations(self) -> None:
        assert self._conn is not None
        for resource in sorted(_iter_migration_resources()):
            sql = resource
            self._conn.executescript(sql)
        self._conn.commit()

    @property
    def _c(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("Storage not initialised. Call initialise() first.")
        return self._conn

    # -- entities ---------------------------------------------------------

    def find_entity_by_id(self, entity_id: str) -> EntityRow | None:
        cur = self._c.execute("SELECT * FROM entities WHERE id = ?", (entity_id,))
        row = cur.fetchone()
        return _row_to_entity(row) if row else None

    def find_entity_exact(self, entity_type: EntityType, name: str) -> EntityRow | None:
        cur = self._c.execute(
            "SELECT * FROM entities WHERE type = ? AND name = ?",
            (entity_type, name),
        )
        row = cur.fetchone()
        return _row_to_entity(row) if row else None

    def find_entity_by_name_any_type(self, name: str) -> EntityRow | None:
        cur = self._c.execute(
            "SELECT * FROM entities WHERE name = ? ORDER BY created_at ASC LIMIT 1",
            (name,),
        )
        row = cur.fetchone()
        return _row_to_entity(row) if row else None

    def find_entity_by_alias(self, alias: str) -> EntityRow | None:
        # First, exact-name case-insensitive match.
        cur = self._c.execute(
            "SELECT * FROM entities WHERE lower(name) = lower(?) ORDER BY created_at ASC LIMIT 1",
            (alias,),
        )
        row = cur.fetchone()
        if row is not None:
            return _row_to_entity(row)
        # Fall back to alias array search. SQLite has no JSON1 array contains
        # operator universally available, so we scan; aliases are sparse.
        cur = self._c.execute("SELECT * FROM entities WHERE aliases != '[]'")
        needle = alias.casefold()
        for arow in cur.fetchall():
            aliases = json.loads(arow["aliases"]) if arow["aliases"] else []
            for a in aliases:
                if a.casefold() == needle:
                    return _row_to_entity(arow)
        return None

    def upsert_entity(
        self,
        entity_type: EntityType,
        name: str,
        *,
        now: datetime,
    ) -> tuple[EntityRow, bool]:
        existing = self.find_entity_exact(entity_type, name)
        if existing is not None:
            return existing, False
        new_id = _new_entity_id()
        self._c.execute(
            "INSERT INTO entities (id, type, name, aliases, created_at) VALUES (?, ?, ?, '[]', ?)",
            (new_id, entity_type, name, now.isoformat()),
        )
        self._c.commit()
        row = EntityRow(
            id=new_id,
            type=entity_type,
            name=name,
            aliases=(),
            created_at=now,
        )
        return row, True

    def add_alias(self, entity_id: str, alias: str) -> None:
        row = self.find_entity_by_id(entity_id)
        if row is None:
            return
        if alias == row.name or alias in row.aliases:
            return
        new_aliases = [*row.aliases, alias]
        self._c.execute(
            "UPDATE entities SET aliases = ? WHERE id = ?",
            (json.dumps(new_aliases), entity_id),
        )
        self._c.commit()

    # -- facts ------------------------------------------------------------

    def find_fact_canonical(
        self,
        subject_id: str,
        predicate: Predicate,
        object_id: str | None,
        object_literal: str | None,
    ) -> FactRow | None:
        if object_id is not None:
            cur = self._c.execute(
                "SELECT * FROM facts WHERE subject_id = ? AND predicate = ? "
                "AND object_kind = 'entity' AND object_id = ? "
                "ORDER BY recorded_at ASC LIMIT 1",
                (subject_id, predicate, object_id),
            )
        else:
            cur = self._c.execute(
                "SELECT * FROM facts WHERE subject_id = ? AND predicate = ? "
                "AND object_kind = 'literal' AND object_literal = ? "
                "ORDER BY recorded_at ASC LIMIT 1",
                (subject_id, predicate, object_literal),
            )
        row = cur.fetchone()
        return _row_to_fact(row) if row else None

    def insert_fact(self, fact: FactRow) -> None:
        self._c.execute(
            "INSERT INTO facts (id, subject_id, predicate, object_kind, object_id, "
            "object_literal, source, confidence, recorded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                fact.id,
                fact.subject_id,
                fact.predicate,
                fact.object_kind,
                fact.object_id,
                fact.object_literal,
                fact.source,
                fact.confidence,
                fact.recorded_at.isoformat(),
            ),
        )
        self._c.commit()

    def insert_provenance(
        self,
        canonical_fact_id: str,
        source: str | None,
        confidence: float,
        recorded_at: datetime,
    ) -> None:
        self._c.execute(
            "INSERT INTO fact_provenance (canonical_fact_id, source, confidence, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            (canonical_fact_id, source, confidence, recorded_at.isoformat()),
        )
        self._c.commit()

    def facts_touching_entity(
        self,
        entity_id: str,
        limit: int = DEFAULT_FACTS_CAP,
    ) -> tuple[list[FactRow], bool]:
        cur = self._c.execute(
            "SELECT * FROM facts WHERE subject_id = ? OR object_id = ? "
            "ORDER BY recorded_at DESC LIMIT ?",
            (entity_id, entity_id, limit + 1),
        )
        rows = [_row_to_fact(r) for r in cur.fetchall()]
        truncated = len(rows) > limit
        return rows[:limit], truncated

    def neighbour_counts(
        self,
        entity_id: str,
        limit: int = DEFAULT_RELATED_CAP,
    ) -> list[tuple[str, int]]:
        cur = self._c.execute(
            "SELECT neighbour_id, COUNT(*) AS c FROM ("
            "  SELECT object_id AS neighbour_id FROM facts "
            "    WHERE subject_id = ? AND object_id IS NOT NULL "
            "  UNION ALL "
            "  SELECT subject_id AS neighbour_id FROM facts "
            "    WHERE object_id = ? "
            ") GROUP BY neighbour_id ORDER BY c DESC LIMIT ?",
            (entity_id, entity_id, limit),
        )
        return [(r["neighbour_id"], int(r["c"])) for r in cur.fetchall()]

    def facts_for_project_decisions(self, project_id: str) -> list[FactRow]:
        cur = self._c.execute(
            "SELECT * FROM facts WHERE predicate = 'decided_in' "
            "AND (subject_id = ? OR object_id = ?)",
            (project_id, project_id),
        )
        return [_row_to_fact(r) for r in cur.fetchall()]

    def decisions_for_project(self, project_id: str) -> list[EntityRow]:
        cur = self._c.execute(
            "SELECT DISTINCT e.* FROM entities e "
            "JOIN facts f ON ("
            "   (f.subject_id = e.id AND f.object_id = ?) OR "
            "   (f.object_id = e.id AND f.subject_id = ?)"
            ") "
            "WHERE e.type = 'decision' AND f.predicate = 'decided_in'",
            (project_id, project_id),
        )
        return [_row_to_entity(r) for r in cur.fetchall()]

    def all_decision_entities(self) -> list[EntityRow]:
        cur = self._c.execute("SELECT * FROM entities WHERE type = 'decision'")
        return [_row_to_entity(r) for r in cur.fetchall()]

    def facts_by_predicate(
        self,
        predicate: Predicate,
        since: datetime | None = None,
    ) -> list[FactRow]:
        if since is None:
            cur = self._c.execute(
                "SELECT * FROM facts WHERE predicate = ? ORDER BY recorded_at DESC",
                (predicate,),
            )
        else:
            cur = self._c.execute(
                "SELECT * FROM facts WHERE predicate = ? AND recorded_at >= ? "
                "ORDER BY recorded_at DESC",
                (predicate, since.isoformat()),
            )
        return [_row_to_fact(r) for r in cur.fetchall()]

    def all_entities(self) -> list[EntityRow]:
        cur = self._c.execute("SELECT * FROM entities")
        return [_row_to_entity(r) for r in cur.fetchall()]

    # -- embeddings (v0.0.2) ---------------------------------------------

    def upsert_embedding(
        self,
        entity_id: str,
        surface_kind: SurfaceKind,
        surface_text: str,
        vector: bytes,
        dim: int,
        model: str,
        *,
        now: datetime,
    ) -> None:
        self._c.execute(
            "INSERT INTO entity_embeddings "
            "(entity_id, surface_kind, surface_text, vector, dim, model, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(entity_id, surface_kind, surface_text) DO UPDATE SET "
            "  vector = excluded.vector, "
            "  dim = excluded.dim, "
            "  model = excluded.model, "
            "  created_at = excluded.created_at",
            (entity_id, surface_kind, surface_text, vector, dim, model, now.isoformat()),
        )
        self._c.commit()

    def all_embeddings(self) -> list[EmbeddingRow]:
        cur = self._c.execute(
            "SELECT entity_id, surface_kind, surface_text, vector, dim, model "
            "FROM entity_embeddings ORDER BY entity_id, surface_kind, surface_text"
        )
        rows: list[EmbeddingRow] = []
        for r in cur.fetchall():
            rows.append(
                EmbeddingRow(
                    entity_id=r["entity_id"],
                    surface_kind=cast(SurfaceKind, r["surface_kind"]),
                    surface_text=r["surface_text"],
                    vector=bytes(r["vector"]),
                    dim=int(r["dim"]),
                    model=r["model"],
                )
            )
        return rows

    def delete_embeddings_for_entity(self, entity_id: str) -> None:
        self._c.execute(
            "DELETE FROM entity_embeddings WHERE entity_id = ?",
            (entity_id,),
        )
        self._c.commit()

    # -- resolution cache (v0.0.2) ---------------------------------------

    def get_cached_resolution(
        self,
        input_text: str,
    ) -> tuple[str, str, float] | None:
        cur = self._c.execute(
            "SELECT entity_id, method, score FROM entity_resolution_cache "
            "WHERE input_text = ?",
            (input_text,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return row["entity_id"], row["method"], float(row["score"])

    def cache_resolution(
        self,
        input_text: str,
        entity_id: str,
        method: str,
        score: float,
        *,
        now: datetime,
    ) -> None:
        self._c.execute(
            "INSERT INTO entity_resolution_cache "
            "(input_text, entity_id, method, score, resolved_at) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(input_text) DO UPDATE SET "
            "  entity_id = excluded.entity_id, "
            "  method = excluded.method, "
            "  score = excluded.score, "
            "  resolved_at = excluded.resolved_at",
            (input_text, entity_id, method, score, now.isoformat()),
        )
        self._c.commit()


def _iter_migration_resources() -> Iterable[str]:
    """Yield migration SQL contents in filename order."""
    files = resources.files(MIGRATIONS_PACKAGE)
    for path in sorted(files.iterdir(), key=lambda p: p.name):
        if path.name.endswith(".sql"):
            yield path.read_text(encoding="utf-8")
