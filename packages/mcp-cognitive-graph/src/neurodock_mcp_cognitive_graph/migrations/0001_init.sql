-- 0001_init.sql
-- Initial schema for the NeuroDock cognitive graph store (v0.0.1).
--
-- Substrate is plain SQLite. sqlite-vec and embeddings are deferred to v0.0.2;
-- alias resolution in v0.0.1 is exact / alias only (literal text match against
-- entities.name and entities.aliases).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entities (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL CHECK (type IN ('person','project','decision','concept','source')),
    name        TEXT NOT NULL,
    aliases     TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
    created_at  TEXT NOT NULL,                 -- ISO 8601 with offset
    UNIQUE (type, name)
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities (name);

CREATE TABLE IF NOT EXISTS facts (
    id              TEXT PRIMARY KEY,
    subject_id      TEXT NOT NULL,
    predicate       TEXT NOT NULL CHECK (predicate IN (
                        'mentioned_in','decided_in','reports_to','depends_on',
                        'resolved_by','blocked_by','tagged','belongs_to')),
    object_kind     TEXT NOT NULL CHECK (object_kind IN ('entity','literal')),
    object_id       TEXT,                     -- nullable; populated when object_kind = entity
    object_literal  TEXT,                     -- nullable; populated when object_kind = literal
    source          TEXT,                     -- nullable; verbatim text/URL/message id
    confidence      REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
    recorded_at     TEXT NOT NULL,            -- ISO 8601 with offset
    FOREIGN KEY (subject_id) REFERENCES entities (id),
    FOREIGN KEY (object_id) REFERENCES entities (id)
);

CREATE INDEX IF NOT EXISTS idx_facts_subject_id ON facts (subject_id);
CREATE INDEX IF NOT EXISTS idx_facts_object_id ON facts (object_id);
CREATE INDEX IF NOT EXISTS idx_facts_predicate ON facts (predicate);
CREATE INDEX IF NOT EXISTS idx_facts_recorded_at ON facts (recorded_at);

-- Append-only provenance log. When (subject_id, predicate, object_id, object_literal)
-- matches an existing canonical fact, record_fact returns the canonical fact_id
-- and writes an entry here noting the merge so source/confidence history is preserved.
CREATE TABLE IF NOT EXISTS fact_provenance (
    canonical_fact_id TEXT NOT NULL,
    source            TEXT,
    confidence        REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    recorded_at       TEXT NOT NULL,
    FOREIGN KEY (canonical_fact_id) REFERENCES facts (id)
);

CREATE INDEX IF NOT EXISTS idx_fact_provenance_canonical
    ON fact_provenance (canonical_fact_id);
