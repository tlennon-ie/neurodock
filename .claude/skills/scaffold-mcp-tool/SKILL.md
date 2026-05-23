---
name: scaffold-mcp-tool
description: Walk through adding a new tool to one of the six MCP servers under packages/mcp-*. Touches schema, handler, registration, tests, ADR delta, CHANGELOG.
---

# scaffold-mcp-tool

A checklist for adding a tool without forgetting any of the six places it
needs to land. The substrate tool discipline is set by ADR 0001
(`docs/decisions/0001-chronometric-tool-design.md`); newer servers follow
the same pattern.

Servers in scope:

- `packages/mcp-chronometric/`
- `packages/mcp-cognitive-graph/`
- `packages/mcp-guardrail/`
- `packages/mcp-task-fractionator/`
- `packages/mcp-translation/`

(Native-host and CLI tools are out of scope here — different bindings.)

## When to use

- Adding a new MCP tool to an existing server.
- Reviewing a PR that claims to add a new tool, to make sure nothing was
  skipped.

## What it does

Walks through the six required edits, in order. The skill does not perform
the edits — it surfaces the checklist and the canonical examples to follow.

### 1. Author the schema

Add `packages/mcp-<server>/schemas/<tool_name>.schema.json`. Use one of
these as a template:

- `packages/mcp-cognitive-graph/schemas/record_fact.schema.json` (input
  with `$ref` defs, output, errors, examples, `compatibility`)
- `packages/mcp-task-fractionator/schemas/decompose.schema.json` (array
  output, dependency model, error vocabulary)
- `packages/mcp-translation/schemas/translate_incoming.schema.json` (LLM
  provenance, eval-corpus slice reference)

Required top-level keys: `$schema`, `$id`, `title`, `description`,
`version`, `properties.input`, `properties.output`, `errors`, `examples`,
`compatibility`.

### 2. Implement the handler

Add `packages/mcp-<server>/src/<package>/tools/<tool_name>.py`. Look at
`packages/mcp-cognitive-graph/src/neurodock_mcp_cognitive_graph/tools/record_fact.py`
for the shape: typed Pydantic models, a single `async def handle(input, ctx)`,
explicit error raising mapped to the schema's `errors` block.

### 3. Register the tool

Add the handler to `packages/mcp-<server>/src/<package>/server.py` in the
tool registration block. The MCP server enumerates handlers; an unregistered
handler is dead code.

### 4. Add tests

Add at least `packages/mcp-<server>/tests/test_<tool_name>.py` with:

- One happy-path test per `examples[]` in the schema.
- One negative-path test per `errors.*` key.
- One side-effect test if the tool mutates state (e.g. record_fact's
  auto-create entities).

### 5. ADR delta (if signature changes)

If the tool's existence or signature affects the substrate design, update
the relevant ADR under `docs/decisions/`. Per ADR 0001, "new tools are
added by extending the schema set; renames or required-param additions
require a new ADR." For purely additive tools, a one-line note in the
existing ADR's "Tool inventory" section is enough.

### 6. CHANGELOG entry

Append to `packages/mcp-<server>/CHANGELOG.md` under a new `## Unreleased`
section. Use the `version-impact` skill before opening the PR to confirm
the bump kind matches the change.

## How to invoke

This skill is a checklist, not a script. Read it before starting the work
and again at the end as a self-review pass.

If a generator script is later added (e.g. `scripts/scaffold-mcp-tool.sh`),
the steps above remain authoritative — the script is convenience, not the
contract.

## Limitations

- No generator exists yet; all six steps are manual.
- The skill does not check that the schema's `$id` URL is unique across
  servers — duplicate `$id`s will cause confusing validator errors elsewhere.
- The skill assumes Python servers. The convention for any future TypeScript
  MCP server (none today) would differ.

## Voice

This is a procedure, not a creative brief. List the steps, name the
canonical examples, then stop. The contributor reading this is already
mid-task and does not want philosophy about why MCP tools exist.
