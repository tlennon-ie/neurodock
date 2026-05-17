-- 0002_embeddings.sql
-- Adds vector storage for embedding-based fuzzy entity recall (v0.0.2).
--
-- Embeddings are stored as raw float32 BLOBs so the store is not coupled to
-- the sqlite-vec extension being available at runtime. When sqlite_vec is
-- present we additionally use a vec0 virtual table for fast cosine lookup;
-- absent that, we fall back to a NumPy pass over the entire table. The two
-- paths produce identical resolution results.
--
-- Embedding dimensionality is capped at 256 to keep storage bounded. The
-- default model (BAAI/bge-small-en-v1.5 via fastembed) emits 384-dim
-- vectors; we truncate-then-renormalise on write. ``dim`` is recorded so
-- mismatched-model writes are caught at query time rather than corrupting
-- the index.

CREATE TABLE IF NOT EXISTS entity_embeddings (
    entity_id   TEXT NOT NULL,
    surface_kind TEXT NOT NULL CHECK (surface_kind IN ('name','alias')),
    surface_text TEXT NOT NULL,
    vector      BLOB NOT NULL,
    dim         INTEGER NOT NULL CHECK (dim > 0 AND dim <= 256),
    model       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (entity_id, surface_kind, surface_text),
    FOREIGN KEY (entity_id) REFERENCES entities (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entity_embeddings_entity
    ON entity_embeddings (entity_id);

-- Cache of resolved (input -> entity, method, score) tuples. Pure
-- read-through: invalidated implicitly by being keyed on input text.
CREATE TABLE IF NOT EXISTS entity_resolution_cache (
    input_text  TEXT PRIMARY KEY,
    entity_id   TEXT NOT NULL,
    method      TEXT NOT NULL CHECK (method IN ('exact','alias','fuzzy','embedding')),
    score       REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
    resolved_at TEXT NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entity_resolution_cache_entity
    ON entity_resolution_cache (entity_id);
