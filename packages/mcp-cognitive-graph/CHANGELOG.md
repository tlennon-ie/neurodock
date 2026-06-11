# Changelog — `neurodock-mcp-cognitive-graph`

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres
to [semantic versioning](https://semver.org/spec/v2.0.0.html). Schemas under
`schemas/` are versioned independently against `v0.1.0` of the contract; the
package implements that contract.

## [0.0.6] - 2026-06-11

### Fixed

- Decisions recorded as `decision belongs_to project` (with the person
  credited via `decided_in` on the decision) now surface in
  `recall_decisions` and `weekly_rollup`. Both read paths previously
  only joined project and decision through a `decided_in` fact touching
  the project, so the natural shape an LLM records came back empty.
  Membership is now `decided_in` OR `belongs_to`, either orientation,
  across all storage backends (PR #74).
- `record_fact` accepts a JSON-stringified `subject`/`object` — some MCP
  clients serialise object arguments for untyped parameters into a JSON
  string, which the server used to reject as a bare string, failing
  every write (PR #72).
- The libSQL/Turso backing applies migrations statement-by-statement,
  skipping PRAGMAs unsupported over remote connections. `executescript`
  silently halted on the schema's leading PRAGMAs, leaving hosted
  databases with no tables (PR #70).

## [0.0.5] - 2026-05-31

- Republish the PyPI README carrying the `mcp-name:` marker so the MCP Registry can verify io.github.tlennon-ie ownership.

## [0.0.4] — 2026-05-24

### Changed

- `record_fact` now returns friendly, actionable errors when the caller sends
  wrong-shape input. The `ToolError` payload gained two optional fields,
  `hint` (a one-sentence explainer of what to do next) and `example` (a
  copy-pasteable valid call). Every failure mode on the `record_fact`
  boundary now attaches both — bare-string `subject`/`object`, missing
  `type`, invalid entity type (`feature`, `bug`, ...), unknown predicate,
  missing `name`/`id`, and out-of-range `confidence`. The original
  technical message is preserved on the `message` field for debuggability.
- `server.record_fact` now accepts `subject`/`predicate`/`object` as `Any`
  so wrong-shape input is caught by the tool's own friendly-error path
  rather than by FastMCP's generic Pydantic validator.
- Unexpected exceptions inside any tool entrypoint are now wrapped as
  `INTERNAL_ERROR` (via new `InternalToolError`) so callers can tell
  "I sent bad input" apart from "the server fell over". The original
  exception is preserved as `__cause__` for log inspection.

### Background

This addresses the `record_fact` UX friction logged on 2026-05-22, where a
caller burned six attempts to land one fact because each Pydantic
validation error told them what was wrong without telling them what shape
to try next. Same wire contract; richer error payloads.

No schema change — the JSON Schemas under `schemas/` still describe the
same `errors` table. The wire payload gains two optional sibling fields
(`hint`, `example`) alongside `error` and `message`.

## [0.0.3] - 2026-05-22

### Changed

- README rewritten for the PyPI surface. ADR references switched from relative
  paths under `../../docs/decisions/` (which rendered as 404s on pypi.org) to
  absolute GitHub URLs. Same fix shipped across all five NeuroDock MCP server
  READMEs in this release cycle.
- Added `[project.urls]` block to `pyproject.toml` so the PyPI sidebar shows
  Homepage, Documentation, Repository, Issues, and Changelog links.

No behaviour change. Same tools, same schemas, same wire contract.

## [0.0.2] — 2026-05-17

Completes the `recall_entity` resolution cascade by adding the `fuzzy` and
`embedding` rungs that v0.0.1 deferred. No schema change; the
`resolution.method` enum in `recall_entity.schema.json` already permits all
four values. ADR 0002 open question 1 is resolved as **conservative
defaults** (the second of the three positions in the ADR); profile
overrides are still a future minor version.

### Added

- Fuzzy resolution rung via `rapidfuzz.fuzz.WRatio` with a 75/100 threshold,
  scoring every entity's name and aliases and returning the highest-scoring
  hit. Ties break on `created_at` for deterministic ordering. Cap of 10
  candidates evaluated per call.
- Embedding resolution rung via `fastembed.TextEmbedding`
  (`BAAI/bge-small-en-v1.5` by default). Cosine threshold 0.82 against
  every (name, alias) surface. Vectors are truncated to 256 dimensions
  before L2-renormalisation and storage so each BLOB is bounded at ~1 KiB.
- Optional `sqlite-vec` integration: when the package is installed and the
  Python build supports `enable_load_extension`, a `vec0` virtual table
  serves cosine queries. Otherwise a NumPy fallback runs the same cosine
  pass in Python. Both paths produce identical results on the test corpus.
- Migration `0002_embeddings.sql` adds `entity_embeddings` and
  `entity_resolution_cache` tables. Existing v0.0.1 databases upgrade in
  place on the next `initialise()` call (the applier runs all
  `NNNN_*.sql` migrations in lexical order on every connection).
- `__schema_version__` constant in the package root, bumped to `2`.
- `NEURODOCK_GRAPH_DISABLE_EMBEDDINGS` opt-out env var: when truthy,
  `get_embedder()` returns `None` and the cascade silently drops the
  embedding rung. Useful for CI runners that cannot download model files.
- Write-side embedding indexing: `record_fact` calls
  `embedding_indexer.index_entity` whenever it auto-creates an entity, so
  the `entity_embeddings` table stays in sync with `entities`.
- 22 new tests across four test modules (`test_fuzzy_resolution.py`,
  `test_embedding_resolution.py`, `test_resolution_cascade.py`,
  `test_migration_0002.py`). All use stub embedders so the test suite
  never downloads the real model.

### Dependencies

- `rapidfuzz>=3.10` (runtime).
- `fastembed>=0.4` (runtime).
- `numpy>=1.26` (runtime).
- `sqlite-vec>=0.1.6` (optional, exposed as the `[vec]` extra).

### Thresholds

| Rung      | Threshold      | Score in `resolution.score` |
| --------- | -------------- | --------------------------- |
| exact     | n/a            | 1.0                         |
| alias     | n/a            | 0.95                        |
| fuzzy     | WRatio >= 75   | WRatio / 100                |
| embedding | cosine >= 0.82 | cosine (clamped 0..1)       |

### Notes

- The cognitive graph server still does not call out to the network at
  runtime; `fastembed` downloads the model file once into the user's
  HuggingFace cache (`~/.cache/huggingface`) on first invocation and reuses
  it from disk thereafter.
- ADR 0002 open question 1 (alias-matching thresholds) ships with the
  **conservative** position. Profile-declared overrides remain future work.

## [0.0.1] — 2026-05-15

First working slice of the cognitive-graph MCP server. Implements the four
tools defined in against the JSON Schemas under `schemas/`.

### Added

- `recall_entity(name_or_alias)` — alias-resolves the input and returns the
  resolved entity, the facts touching it (most recent first, capped at 500),
  first-degree neighbours (capped at 20), and a resolution diagnostic.
- `record_fact(subject, predicate, object, source?, confidence?)` — persists a
  typed-edge fact. Auto-creates entities by `(type, name)`. Enforces the
  v0.1.0 eight-predicate vocabulary; unknown predicates raise
  `PREDICATE_NOT_IN_VOCABULARY`.
- `recall_decisions(project, since?)` — returns decisions for a project,
  ordered by `decided_on` descending, capped at 200. Decisions are the UNION
  of `decided_in` facts and entities of `type == "decision"` linked to the
  project.
- `weekly_rollup(project?)` — returns a server-templated activity summary for
  the trailing seven UTC days. Summary text is rendered by local templating;
  no LLM is called from inside the server (vendor boundary, ADR 0002 §6).
- SQLite-backed storage at `~/.neurodock/cognitive-graph.sqlite` (overridable
  via `NEURODOCK_GRAPH_DB_PATH`). Embedded migration `0001_init.sql` creates
  `entities`, `facts`, and `fact_provenance` tables.
- Pure-Python in-memory storage backing for deterministic tests.
- Pydantic v2 models that mirror the JSON Schemas exactly.
- 25 tests across five test files: 19 unit tests (≥ 3 per tool) plus a
  six-test FastMCP protocol-conformance suite that validates every tool
  response against the JSON Schema using `jsonschema`.

### ADR 0002 open-question resolutions applied

- **Open question 2 — `record_fact` deduplication semantics:** option 2
  (**append-only with logical fact id**). A duplicate `(subject, predicate,
object)` returns the canonical `fact_id` with `deduplicated=true`; the new
  `source` / `confidence` is appended to a `fact_provenance` log so provenance
  is preserved.
- **Open question 3 — `weekly_rollup.next_actions` without an LLM:** option 1
  (**keep the heuristic, label it**). The list is synthesised from open
  blockers (`blocked_by` facts not yet `resolved_by`), recent decisions
  lacking follow-up, and any facts tagged `"next-action"`. Capped at 10.
- **Open question 1 — alias-matching thresholds:** v0.0.1 ships only the
  conservative `exact` and `alias` rungs (exact name, then case-insensitive
  name/alias match). Fuzzy and embedding ranks land in v0.0.2.

### Deferred to v0.0.2 (vector recall)

- **`fastembed` / `nomic-embed-text` embeddings** — v0.0.1 ships without any
  embedding backend to keep the install footprint small and avoid model
  downloads on first run. The `resolution.method` enum still permits `fuzzy`
  and `embedding` per the schema; the implementation will switch them on in
  v0.0.2.
- **`sqlite-vec` extension** — vector columns are not yet provisioned in the
  migration. v0.0.2 will add `0002_vector.sql` introducing `entity_embeddings`
  and `decision_embeddings` tables.
- **Fuzzy name matching** — token-level fuzzy match (e.g. RapidFuzz)
  alongside the embedding rank.
- **SQLCipher at-rest encryption** — gated on a profile opt-in.

### Workspace-level changes

- Added `pytest-asyncio` to the workspace dev-dep group in the root
  `pyproject.toml` (required to drive the FastMCP protocol-conformance tests).
  Justification: this is a transitive test-tooling dep, not a runtime dep, and
  the four-substrate-server roadmap will share the same async test
  infrastructure.

### Notes

- All four tools read or write only the local SQLite store. No network
  access. `source` strings are stored verbatim and never fetched.
- User content (entity names, decision titles, source URLs, fact text) is
  never logged. Tool-error logs include only the error code.
- Tests use `tmp_path` SQLite stores and a frozen clock; no test touches
  `~/.neurodock/`.
