# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""libSQL/Turso-backed storage for the cognitive graph (ADR 0010 Phases C/D).

This backing mirrors :class:`SQLiteStorage` byte-for-byte at the SQL level:
libSQL is a SQLite fork, so the dialect and the on-disk embedding BLOB layout
are identical. The same migrations apply, and the same NumPy cosine fallback
in :mod:`vector_search` reads embedding rows out of it unchanged.

Two connection shapes are supported by the same class:

* a **local** ``file:`` path (or bare path) — used by the test-suite and any
  single-process embedded deployment; and
* a **remote** ``libsql://`` / ``https://`` URL with an auth token — the hosted
  (Phase C) and bring-your-own-store (Phase D) deployments.

The ``libsql`` client is imported **lazily** inside :meth:`initialise` so the
default local stdio install (which uses :class:`SQLiteStorage`) never pulls a
network database client. Install the optional ``libsql`` extra to use this
backing.

Implementation notes
--------------------
* The libsql DB-API client returns plain tuples and does **not** implement
  ``row_factory``. We therefore map each result row to a dict keyed by the
  cursor's ``description`` column names, then reuse the exact same row-shaping
  logic as :class:`SQLiteStorage`.
* Vector search goes through the storage-agnostic :class:`NumpySearcher`
  (read every embedding for the graph, cosine in Python). This works over any
  libSQL connection without requiring a vector-capable build or the sqlite-vec
  extension. FUTURE optimisation: when running against a libSQL build with
  native vector support, the ``vector_top_k`` table function could replace the
  full table scan for large graphs — but the NumPy path is correct and
  sufficient for v1, and keeps results identical to the SQLite backing.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from importlib import resources
from typing import TYPE_CHECKING, Any, cast

from neurodock_mcp_cognitive_graph.storage.base import (
    DEFAULT_FACTS_CAP,
    DEFAULT_RELATED_CAP,
    PROJECT_DECISION_PREDICATES,
    EmbeddingRow,
    EntityRow,
    FactRow,
    SurfaceKind,
)
from neurodock_mcp_cognitive_graph.types import EntityType, Predicate

if TYPE_CHECKING:  # pragma: no cover - import for typing only
    from collections.abc import Iterable

MIGRATIONS_PACKAGE = "neurodock_mcp_cognitive_graph.migrations"

# Row = a mapping of column name -> value, reconstructed from the libsql
# cursor's positional tuples plus its ``description``.
Row = dict[str, Any]


def _new_entity_id() -> str:
    return f"ent_{uuid.uuid4().hex[:24]}"


def _row_to_entity(row: Row) -> EntityRow:
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


def _row_to_fact(row: Row) -> FactRow:
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


class LibSqlStorage:
    """libSQL/Turso-backed store. Synchronous; safe for the FastMCP loop.

    Construct with a local ``file:`` path *or* a remote ``libsql://`` URL.
    Call :meth:`initialise` before use to open the connection and apply the
    schema migrations (idempotent).
    """

    def __init__(self, url: str, auth_token: str | None = None) -> None:
        self._url = url
        self._auth_token = auth_token
        self._conn: Any | None = None

    # -- lifecycle --------------------------------------------------------

    def initialise(self) -> None:
        # Lazy import so the default local install never requires the network
        # database client. Install the ``libsql`` extra to use this backing.
        try:
            import libsql
        except ImportError as exc:  # pragma: no cover - exercised via skip in tests
            raise RuntimeError(
                "The 'libsql' package is required for LibSqlStorage. "
                "Install it with the optional extra: "
                "`pip install neurodock-mcp-cognitive-graph[libsql]`."
            ) from exc

        # A remote URL takes an auth token; a local file path does not. We pass
        # the token through only when present so a local file connection is not
        # rejected for receiving an unexpected keyword argument.
        if self._auth_token is not None:
            self._conn = libsql.connect(self._url, auth_token=self._auth_token)
        else:
            self._conn = libsql.connect(self._url)
        self._apply_migrations()

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def _apply_migrations(self) -> None:
        # Apply each migration statement individually rather than via
        # ``executescript``. Over a REMOTE libSQL/Turso connection,
        # ``executescript`` silently halts on the local-only PRAGMAs at the top of
        # the schema (``journal_mode = WAL``, ``foreign_keys = ON``) — which Turso
        # manages itself and does not accept — leaving every CREATE TABLE
        # unexecuted, so the database has no tables. (Local ``file:`` connections
        # accept the PRAGMAs, which is why the unit tests, all on ``file:`` URLs,
        # never caught this.) Executing statements one at a time and skipping an
        # unsupported PRAGMA lets the DDL run on both local files and Turso.
        conn = self._c
        for sql in _iter_migration_resources():
            for statement in _split_sql_statements(sql):
                try:
                    conn.execute(statement)
                except Exception:
                    # PRAGMAs are advisory here; a remote backend rejecting one
                    # must not abort the schema migration. DDL failures must still
                    # surface, so only swallow PRAGMA statements.
                    if statement.lstrip().upper().startswith("PRAGMA"):
                        continue
                    raise
        conn.commit()

    @property
    def _c(self) -> Any:
        if self._conn is None:
            raise RuntimeError("Storage not initialised. Call initialise() first.")
        return self._conn

    # -- result shaping ---------------------------------------------------

    def _query_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[Row]:
        """Run a SELECT and return rows as column-name-keyed dicts."""
        cur = self._c.execute(sql, params)
        description = cur.description
        if description is None:
            return []
        columns = [d[0] for d in description]
        return [dict(zip(columns, raw, strict=False)) for raw in cur.fetchall()]

    def _query_one(self, sql: str, params: tuple[Any, ...] = ()) -> Row | None:
        rows = self._query_all(sql, params)
        return rows[0] if rows else None

    # -- entities ---------------------------------------------------------

    def find_entity_by_id(self, entity_id: str) -> EntityRow | None:
        row = self._query_one("SELECT * FROM entities WHERE id = ?", (entity_id,))
        return _row_to_entity(row) if row else None

    def find_entity_exact(self, entity_type: EntityType, name: str) -> EntityRow | None:
        row = self._query_one(
            "SELECT * FROM entities WHERE type = ? AND name = ?",
            (entity_type, name),
        )
        return _row_to_entity(row) if row else None

    def find_entity_by_name_any_type(self, name: str) -> EntityRow | None:
        row = self._query_one(
            "SELECT * FROM entities WHERE name = ? ORDER BY created_at ASC LIMIT 1",
            (name,),
        )
        return _row_to_entity(row) if row else None

    def find_entity_by_alias(self, alias: str) -> EntityRow | None:
        # First, exact-name case-insensitive match.
        row = self._query_one(
            "SELECT * FROM entities WHERE lower(name) = lower(?) ORDER BY created_at ASC LIMIT 1",
            (alias,),
        )
        if row is not None:
            return _row_to_entity(row)
        # Fall back to alias array search. SQLite/libSQL has no universally
        # available JSON array-contains operator, so we scan; aliases are sparse.
        needle = alias.casefold()
        for arow in self._query_all("SELECT * FROM entities WHERE aliases != '[]'"):
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
            row = self._query_one(
                "SELECT * FROM facts WHERE subject_id = ? AND predicate = ? "
                "AND object_kind = 'entity' AND object_id = ? "
                "ORDER BY recorded_at ASC LIMIT 1",
                (subject_id, predicate, object_id),
            )
        else:
            row = self._query_one(
                "SELECT * FROM facts WHERE subject_id = ? AND predicate = ? "
                "AND object_kind = 'literal' AND object_literal = ? "
                "ORDER BY recorded_at ASC LIMIT 1",
                (subject_id, predicate, object_literal),
            )
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
        rows = [
            _row_to_fact(r)
            for r in self._query_all(
                "SELECT * FROM facts WHERE subject_id = ? OR object_id = ? "
                "ORDER BY recorded_at DESC LIMIT ?",
                (entity_id, entity_id, limit + 1),
            )
        ]
        truncated = len(rows) > limit
        return rows[:limit], truncated

    def neighbour_counts(
        self,
        entity_id: str,
        limit: int = DEFAULT_RELATED_CAP,
    ) -> list[tuple[str, int]]:
        rows = self._query_all(
            "SELECT neighbour_id, COUNT(*) AS c FROM ("
            "  SELECT object_id AS neighbour_id FROM facts "
            "    WHERE subject_id = ? AND object_id IS NOT NULL "
            "  UNION ALL "
            "  SELECT subject_id AS neighbour_id FROM facts "
            "    WHERE object_id = ? "
            ") GROUP BY neighbour_id ORDER BY c DESC LIMIT ?",
            (entity_id, entity_id, limit),
        )
        return [(r["neighbour_id"], int(r["c"])) for r in rows]

    def facts_for_project_decisions(self, project_id: str) -> list[FactRow]:
        placeholders = ", ".join("?" * len(PROJECT_DECISION_PREDICATES))
        rows = self._query_all(
            f"SELECT * FROM facts WHERE predicate IN ({placeholders}) "
            "AND (subject_id = ? OR object_id = ?)",
            (*PROJECT_DECISION_PREDICATES, project_id, project_id),
        )
        return [_row_to_fact(r) for r in rows]

    def decisions_for_project(self, project_id: str) -> list[EntityRow]:
        placeholders = ", ".join("?" * len(PROJECT_DECISION_PREDICATES))
        rows = self._query_all(
            "SELECT DISTINCT e.* FROM entities e "
            "JOIN facts f ON ("
            "   (f.subject_id = e.id AND f.object_id = ?) OR "
            "   (f.object_id = e.id AND f.subject_id = ?)"
            ") "
            f"WHERE e.type = 'decision' AND f.predicate IN ({placeholders})",
            (project_id, project_id, *PROJECT_DECISION_PREDICATES),
        )
        return [_row_to_entity(r) for r in rows]

    def all_decision_entities(self) -> list[EntityRow]:
        rows = self._query_all("SELECT * FROM entities WHERE type = 'decision'")
        return [_row_to_entity(r) for r in rows]

    def facts_by_predicate(
        self,
        predicate: Predicate,
        since: datetime | None = None,
    ) -> list[FactRow]:
        if since is None:
            rows = self._query_all(
                "SELECT * FROM facts WHERE predicate = ? ORDER BY recorded_at DESC",
                (predicate,),
            )
        else:
            rows = self._query_all(
                "SELECT * FROM facts WHERE predicate = ? AND recorded_at >= ? "
                "ORDER BY recorded_at DESC",
                (predicate, since.isoformat()),
            )
        return [_row_to_fact(r) for r in rows]

    def all_entities(self) -> list[EntityRow]:
        rows = self._query_all("SELECT * FROM entities")
        return [_row_to_entity(r) for r in rows]

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
        rows = self._query_all(
            "SELECT entity_id, surface_kind, surface_text, vector, dim, model "
            "FROM entity_embeddings ORDER BY entity_id, surface_kind, surface_text"
        )
        out: list[EmbeddingRow] = []
        for r in rows:
            out.append(
                EmbeddingRow(
                    entity_id=r["entity_id"],
                    surface_kind=cast(SurfaceKind, r["surface_kind"]),
                    surface_text=r["surface_text"],
                    vector=bytes(r["vector"]),
                    dim=int(r["dim"]),
                    model=r["model"],
                )
            )
        return out

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
        row = self._query_one(
            "SELECT entity_id, method, score FROM entity_resolution_cache WHERE input_text = ?",
            (input_text,),
        )
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


def _split_sql_statements(script: str) -> list[str]:
    """Split a migration script into individual statements.

    Strips ``-- ...`` comments to end-of-line first (the migrations contain
    inline comments whose text includes a semicolon, e.g. ``-- nullable;
    populated``, which would otherwise break the split), then splits on ``;``.
    The cognitive-graph migrations are plain DDL — no triggers and no semicolons
    inside string literals — so this simple split is safe. Per-statement
    execution is what lets the schema apply over remote libSQL, where
    ``executescript`` halts on the local-only PRAGMAs.
    """
    stripped_lines: list[str] = []
    for line in script.splitlines():
        marker = line.find("--")
        if marker != -1:
            line = line[:marker]
        stripped_lines.append(line)
    cleaned = "\n".join(stripped_lines)
    return [statement.strip() for statement in cleaned.split(";") if statement.strip()]


def _iter_migration_resources() -> Iterable[str]:
    """Yield migration SQL contents in filename order."""
    files = resources.files(MIGRATIONS_PACKAGE)
    for path in sorted(files.iterdir(), key=lambda p: p.name):
        if path.name.endswith(".sql"):
            yield path.read_text(encoding="utf-8")
