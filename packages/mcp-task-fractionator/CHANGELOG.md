# Changelog — `mcp-task-fractionator`

All notable changes to this package will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.4] - 2026-05-31

- Republish the PyPI README carrying the `mcp-name:` marker so the MCP Registry can verify io.github.tlennon-ie ownership.

### Added — opt-in HTTP transport (ADR 0009 Phase 2)

The entrypoint can now run over **Streamable HTTP** in addition to stdio. The
default is unchanged: with no HTTP signal, `main()` runs **stdio** with BOTH
tools, byte-for-byte identical to before. HTTP is opt-in and selected when
either the `NEURODOCK_HTTP` env var is truthy (`1`/`true`/`yes`/`on`,
case-insensitive) or a `--http` CLI arg is passed; it binds
`NEURODOCK_HTTP_HOST` (default `127.0.0.1`) and `NEURODOCK_HTTP_PORT`
(default `8000`).

- **Remote scope boundary enforced in code (ADR 0008/0009 §2).** The HTTP build
  registers ONLY `decompose` (stateless, remote-safe). `next_one` reads the
  local cognitive graph and is registered in **stdio mode only** — it is absent
  from the HTTP build's tool list entirely. `build_server` gained an
  `http_mode` keyword that gates the `next_one` registration.
- New pure helper `transport.select_transport(env, argv) -> TransportConfig`
  factors transport selection out of `main()` so it is unit-testable without
  binding a socket.
- No auth/OAuth, no tool-logic changes, and no other packages touched — the bare
  HTTP flag binds to localhost and is for local/integration testing until the
  OAuth sub-phase lands (ADR 0009 §3).
- Tests (`test_transport.py`): default→stdio (both tools), `NEURODOCK_HTTP=1`→
  http 127.0.0.1:8000, host/port overrides, `--http`→http, and the scope
  assertion that the HTTP toolset contains `decompose` and not `next_one` while
  the stdio toolset contains both. `FastMCP.run` is monkeypatched so no socket
  binds.

### Fixed — removed unreachable forward-reference block in sources/base.py

The `if False:` guard around the type-checker-only imports in
`sources/base.py` was replaced with the standard `if TYPE_CHECKING:` idiom.
Both evaluate to `False` at runtime (no import is executed; no circular
dependency is introduced), but `TYPE_CHECKING` is the canonical pattern that
static-analysis tools recognise as intentional — eliminating CodeQL alert #11
(unreachable statement). A regression test (`test_base_module_imports_cleanly_at_runtime`)
asserts that reloading the module still returns the correct default source.

## [0.0.3] - 2026-05-22

### Changed

- README rewritten for the PyPI surface. ADR references switched from relative
  paths under `../../docs/decisions/` (which rendered as 404s on pypi.org) to
  absolute GitHub URLs. Same fix shipped across all five NeuroDock MCP server
  READMEs in this release cycle.
- Added `[project.urls]` block to `pyproject.toml` so the PyPI sidebar shows
  Homepage, Documentation, Repository, Issues, and Changelog links.

No behaviour change. Same tools, same schemas, same wire contract.

## [0.0.1] — 2026-05-15

### Added

- FastMCP server (`neurodock-mcp-task-fractionator`) registering the two tools
  specified in and the schemas at `schemas/decompose.schema.json`
  and `schemas/next_one.schema.json`:
  - `decompose(goal, time_budget?)` — local-heuristic decomposition into
    atomic 5–90 minute tasks with required acceptance criteria, a total
    ordering, and dependency-sorted output (topological + tie-break by
    `estimated_minutes` then `id`). Hard cap of 20 tasks.
  - `next_one(project)` — returns exactly one task or `NO_TASKS_AVAILABLE`,
    with a confidence score and a short reasoning paragraph.
- Pluggable `PendingTaskSource` protocol with two implementations:
  - `InMemoryPendingTaskSource` — used by tests and small skill use-cases.
  - `CognitiveGraphPendingTaskSource` — v0.0.1 stub. Always raises
    `COGNITIVE_GRAPH_UNAVAILABLE`. Real wiring lands in Phase 2.
- `NEURODOCK_TASK_SOURCE=memory|graph` env var selects the source at server
  build time. Default is `memory`.
- ISO 8601 `time_budget` parser with the working-block convention from
  ADR 0003 §3 (`P3D` ⇒ 3 × 4-hour blocks).
- Test suite (≥ 17 tests):
  - `test_decompose.py` — happy path, sequence-total-order, vague goal,
    short / long goal, unparseable budget, budget infeasibility, privacy
    invariant (rationale never includes goal text).
  - `test_next_one.py` — lowest-sequence pick, post-completion pick,
    no-tasks, all-blocked, empty-project.
  - `test_duration_parsing.py` — hours, hours+minutes, minutes,
    days→working-blocks, malformed, empty, bare `P`.
  - `test_topological.py` — linear chain, tie-break, cycle, unknown dep.
  - `test_sources.py` — factory default, env-driven graph, fallback,
    stub-raises-unavailable, protocol conformance.
  - `test_protocol_conformance.py` — boots FastMCP in-process; validates
    both tools' responses against the JSON Schemas.

### Deferred to later releases

- **`next_one` cognitive-graph integration.** The graph source is a stub.
  Production callers must use `NEURODOCK_TASK_SOURCE=memory` and pass a
  pre-populated `InMemoryPendingTaskSource` until the cognitive-graph
  client ships.
- **`decompose_with_assist`** (per ADR 0003 §2) — accepts an LLM-drafted
  decomposition client-side. v0.2 work.
- **`next_one` energy-zone weighting** (per ADR 0003 open question 2) —
  reads `get_time_context()` and biases candidates by energy fit. Phase 2.
- **SQLite-backed event log** for decomposition history. Not in scope for
  v0.0.1 (the server is stateless).

### ADR 0003 resolutions applied

- **§1 statelessness:** `decompose` returns the task list and never persists.
  Persistence is the caller's responsibility via `mcp-cognitive-graph`.
- **§2 no LLM in server:** v0.0.1 uses a verb / noun / time-marker
  heuristic engine. No network calls. No model imports.
- **§3 time_budget parsing:** ISO 8601 regex, identical to chronometric's.
  Unparseable input raises `TIME_BUDGET_UNPARSEABLE`. `P3D` ⇒ 3 working
  blocks of 4 hours each, not 72 hours.
- **§4 acceptance criteria required:** server-side invariant
  `ACCEPTANCE_CRITERIA_REQUIRED` enforced before topological sort. Every
  verb template ships with ≥ 1 criterion.
- **§5 dependency cycles:** topological sort raises
  `DEPENDENCY_CYCLE` on cycle; surfaced as a structured error.
- **§6 sequence is total order:** `topological_sort` returns a flat list;
  tie-break is `(estimated_minutes, id)` per ADR.
- **§7 privacy:** goal text and project name are never logged. The
  rationale generator surfaces only server-controlled vocabulary tokens.
- **Open question 1 (clarifying questions):** server returns one canned
  question per ambiguity class (`no_recognised_verb`,
  `no_recognised_verb_or_noun`). Richer clarification is a skill concern.
- **Open question 3 (BUDGET_INFEASIBLE payload):** strict variant — error
  carries `minimum_feasible_minutes` and `attempted_task_count`; no
  partial draft.

### Known limitations

- Decomposition quality is bounded by the heuristic vocabulary. Goals that
  use uncommon verbs (`benchmark`, `instrument`, `prototype`) currently
  produce a single scope task plus a generic close-out step. ADR 0003's
  v0.2 `decompose_with_assist` path closes this gap.
- `CognitiveGraphPendingTaskSource` is a stub. Setting
  `NEURODOCK_TASK_SOURCE=graph` produces `COGNITIVE_GRAPH_UNAVAILABLE` on
  every `next_one` call.
