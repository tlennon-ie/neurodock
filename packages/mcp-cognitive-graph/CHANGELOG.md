# Changelog — `neurodock-mcp-cognitive-graph`

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres
to [semantic versioning](https://semver.org/spec/v2.0.0.html). Schemas under
`schemas/` are versioned independently against `v0.1.0` of the contract; the
package implements that contract.

## [0.0.1] — 2026-05-15

First working slice of the cognitive-graph MCP server. Implements the four
tools defined in  against the JSON Schemas under `schemas/`.

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
