# neurodock-mcp-task-fractionator

Local-first goal decomposition and single next-action selection, exposed as
an MCP server.

- **Version:** v0.0.3 (developer preview)
- **Status:** Phase 1 substrate server.
- **License:** AGPL-3.0-or-later.
- **Design:** see [ADR 0003 — task-fractionator tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0003-task-fractionator-tool-design.md).
- **Schemas (the contract):** [`schemas/decompose.schema.json`](./schemas/decompose.schema.json) and [`schemas/next_one.schema.json`](./schemas/next_one.schema.json).
- **User stories driving this server:** ("Director with ADHD" — voice-dump a vague initiative, get 5–12 atomic tasks plus the single next one).

## Tools

### `decompose(goal, time_budget?)`

Local-heuristic decomposition into atomic 5–90 minute tasks. Every task
carries at least one acceptance criterion, a dependency-sorted sequence
number, and a small bag of tags. Stateless: the server returns the list
and does **not** persist it. Persistence is the caller's job via
`mcp-cognitive-graph`.

- `goal` — 5..500 character plain-language goal. **Never logged.**
- `time_budget` — optional ISO 8601 duration (`PT4H`, `P3D`, `PT2H30M`).
  Unparseable input returns `TIME_BUDGET_UNPARSEABLE`. `P3D` is treated
  as **3 working blocks of 4 hours**, not 72 hours, per ADR 0003 §3.

Errors: `GOAL_REQUIRED`, `GOAL_TOO_LONG`, `TIME_BUDGET_UNPARSEABLE`,
`BUDGET_INFEASIBLE`, `DEPENDENCY_CYCLE`, `ACCEPTANCE_CRITERIA_REQUIRED`,
`DECOMPOSITION_UNAVAILABLE`.

### `next_one(project)`

Returns exactly one task — the single thing the user should do next —
with a short reasoning paragraph and a confidence score in `[0, 1]`.

- `project` — 1..120 char project name (case-sensitive, no fuzzy match).
- Pending tasks are read from a pluggable `PendingTaskSource`.
- Selection: lowest `sequence` whose `dependencies` are all already
  complete in the pending set.

Errors: `PROJECT_REQUIRED`, `NO_TASKS_AVAILABLE`, `ALL_TASKS_BLOCKED`,
`COGNITIVE_GRAPH_UNAVAILABLE`.

## Quick start

```bash
# From the repo root
uv sync
uv run pytest packages/mcp-task-fractionator/tests/ -v

# Run the server over stdio (the MCP transport):
uv run neurodock-mcp-task-fractionator
```

## In-memory-only `next_one` (v0.0.3 caveat)

`next_one` reads pending tasks from a `PendingTaskSource`. v0.0.3 ships two
implementations:

- **`InMemoryPendingTaskSource`** — default, used by tests. Holds tasks in
  process memory. Build the server explicitly with this source and seed it
  before calling `next_one`:

  ```python
  from neurodock_mcp_task_fractionator import (
      InMemoryPendingTaskSource, build_server,
  )

  source = InMemoryPendingTaskSource()
  source.add("founding-scope-rfc", [task_1, task_2, task_3])
  server = build_server(source=source)
  ```

- **`CognitiveGraphPendingTaskSource`** — Phase 2 stub. Always raises
  `COGNITIVE_GRAPH_UNAVAILABLE`. Real wiring lands once the
  `mcp-cognitive-graph` Python client ships.

Selection via env var: `NEURODOCK_TASK_SOURCE=memory|graph` (default
`memory`). Unknown values fall back to `memory` rather than crashing.

## Privacy

Per ADR 0003 §7 the goal text and project name are treated as sensitive
user data:

- No remote calls. No LLM call inside the server.
- Goal text is **never** logged at any level.
- Validation errors reference field names, not user content.
- The rationale paragraph is built from recognised vocabulary tokens
  only; it never embeds the user's original goal text verbatim.

A test (`test_decompose.py::test_rationale_does_not_contain_goal_text`)
encodes the privacy invariant.

## Development gates

```bash
# Lint + format check
uv run ruff check packages/mcp-task-fractionator/
uv run ruff format --check packages/mcp-task-fractionator/

# Strict type check
uv run mypy --strict packages/mcp-task-fractionator/src/

# Tests
uv run pytest packages/mcp-task-fractionator/tests/ -v
```

All four must pass before a PR is mergeable.

## Pointers

- Architecture rationale: [ADR 0003 — task-fractionator tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0003-task-fractionator-tool-design.md).
- The five-principles manifesto this server has to honour: `MANIFESTO.md`.
- Sibling servers: `mcp-chronometric` (time, idle, breaks) and
  `mcp-cognitive-graph` (persistent state — where pending tasks will live).
