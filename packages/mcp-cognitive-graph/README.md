# `neurodock-mcp-cognitive-graph`

Persistent entity memory for the NeuroDock substrate, exposed as an MCP
server. Externalises the user's working memory of people, projects,
decisions, and concepts so a hyperfocused or context-switched session does
not start from zero.

This is **v0.0.3** — the current release. Vector recall, `fastembed`
embeddings, and `sqlite-vec` are deferred to a future version; see `CHANGELOG.md`.

## Install

```sh
uv add neurodock-mcp-cognitive-graph
# or
pip install neurodock-mcp-cognitive-graph
```

## Use as an MCP server

Add to your `~/.claude.json` (Claude Code) or `claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "neurodock-cognitive-graph": {
      "command": "uv",
      "args": ["run", "neurodock-mcp-cognitive-graph"]
    }
  }
}
```

## Quickstart

```bash
# From the workspace root.
uv sync --all-packages

# Start the server on stdio (Claude Desktop / Claude Code MCP config).
uv run neurodock-mcp-cognitive-graph
```

The server stores its graph at `~/.neurodock/cognitive-graph.sqlite` by
default. Override with the `NEURODOCK_GRAPH_DB_PATH` environment variable.

## Tools (v0.0.3)

| Tool                                                            | Purpose                                                                                                                                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recall_entity(name_or_alias)`                                  | Look up a person/project/decision/concept. Returns the entity, its facts (capped at 500), first-degree neighbours (capped at 20), and a resolution diagnostic. |
| `record_fact(subject, predicate, object, source?, confidence?)` | Persist a typed-edge fact. Auto-creates entities by `(type, name)`. Enforces the v0.1.0 eight-predicate vocabulary.                                            |
| `recall_decisions(project, since?)`                             | Return decisions for a project, ordered by date desc, capped at 200.                                                                                           |
| `weekly_rollup(project?)`                                       | Server-templated activity summary for the trailing seven UTC days. No LLM call (vendor boundary).                                                              |

The full input/output contract is in `schemas/`. The Pydantic v2 models in
`src/neurodock_mcp_cognitive_graph/types.py` mirror those schemas.

## Predicate vocabulary

The eight predicates in v0.1.0 are: `mentioned_in`, `decided_in`,
`reports_to`, `depends_on`, `resolved_by`, `blocked_by`, `tagged`,
`belongs_to`. Unknown predicates raise `PREDICATE_NOT_IN_VOCABULARY`.
Extension predicates land via the v0.2 `type_extensions` mechanism — see
[ADR 0002 — cognitive-graph tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0002-cognitive-graph-tool-design.md).

## Privacy

- Local-first. No network access. No telemetry.
- `source` strings are stored verbatim and **never fetched** by the server.
- User content (entity names, decision titles, fact text) is never logged.
  Error logs include only the structured error code.

## Storage

SQLite. One file. Migrations live as numbered `.sql` files in
`src/neurodock_mcp_cognitive_graph/migrations/` and are applied on first
connect. The schema is described in `migrations/0001_init.sql`.

## Architecture

```
src/neurodock_mcp_cognitive_graph/
├── server.py            FastMCP wiring + CLI entrypoint
├── types.py             Pydantic v2 models (mirror of the JSON Schemas)
├── config.py            Resolves the SQLite path
├── clock.py             SystemClock / FixedClock
├── errors.py            ToolError envelope
├── resolution.py        Entity name/alias cascade (exact, alias only in v0.0.3)
├── rollup.py            Heuristic decision/blocker/next-action assembly
├── storage/
│   ├── base.py          Storage Protocol + row dataclasses
│   ├── memory.py        InMemoryStorage (used by tests)
│   └── sqlite.py        SQLiteStorage (production backing)
├── tools/
│   ├── recall_entity.py
│   ├── record_fact.py
│   ├── recall_decisions.py
│   └── weekly_rollup.py
└── migrations/
    └── 0001_init.sql
```

## ADR pointers

- [ADR 0002 — cognitive-graph tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0002-cognitive-graph-tool-design.md)
  — the design rationale, vocabularies, output shapes, and the three open
  questions whose v0.0.3 resolutions are documented in `CHANGELOG.md`.
- [ADR 0001 — chronometric tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0001-chronometric-tool-design.md)
  — the cross-cutting precedents (ISO 8601 with offsets, enums for coarse
  signals, structured errors) that this package inherits.

## Tests

```bash
uv run pytest packages/mcp-cognitive-graph/tests/ -v
```

25 tests covering: per-tool unit tests, a FastMCP protocol-conformance suite
that exercises every tool and validates the response against the JSON Schema
using `jsonschema`, and an end-to-end test that runs against a real
file-backed SQLite store.
