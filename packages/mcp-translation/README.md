<!-- mcp-name: io.github.tlennon-ie/neurodock-mcp-translation -->

# neurodock-mcp-translation

Communication and translation tools as an MCP server. Shares its schemas and
prompt library with `@neurodock/extension-browser` (Phase 2).

**Version:** 0.0.2 (developer preview, deterministic baseline).

## Status

v0.0.x implements the four tools specified in ADR
[0005 — translation tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0005-translation-tool-design.md):

| Tool                 | Status                                               |
| -------------------- | ---------------------------------------------------- |
| `translate_incoming` | deterministic baseline + LLM-refinement prompt       |
| `check_tone`         | deterministic baseline + LLM-refinement prompt       |
| `rewrite_outgoing`   | deterministic baseline + LLM-refinement prompt       |
| `brief_meeting`      | deterministic baseline + verbatim-anchor enforcement |

## Design framing: deterministic baseline + optional LLM refinement

Per ADR 0005 §1, this server contains **no LLM SDK** (no `anthropic`, no
`openai`, no `ollama` import). The substrate is provider-agnostic by
construction. Each tool returns an envelope of the shape:

```json
{
  "deterministic_analysis": {
    /* v0.1.0 output shape, populated heuristically */
  },
  "prompt_for_llm_refinement": {
    "role": "user",
    "content": "<rendered prompt template>",
    "output_schema_ref": "packages/mcp-translation/schemas/<tool>.schema.json"
  },
  "eval_corpus_slice": "packages/evals/corpora/translation/<slice>.jsonl"
}
```

The caller's MCP client (Claude Desktop, Claude Code, a custom MCP host) can:

1. **Use the deterministic analysis alone** — useful when no LLM is
   available, when latency matters, or when the user has not yet configured a
   provider. The deterministic baseline already detects common ambiguity
   patterns (`circle back`, `let's revisit`, `next week`), scores tone on
   simple word-list heuristics, and partitions meeting transcripts via
   speaker-prefix and regex matching.
2. **Refine via its own LLM** — feed `prompt_for_llm_refinement.content` to
   the caller's configured model (Claude, GPT, local Llama) and ask for a
   JSON response conforming to the schema at `output_schema_ref`. Replace the
   deterministic analysis with the refined object before rendering to the
   user.

This makes the server **useful without a connected LLM** and **vendor-neutral
when one is connected**.

## Verbatim-anchor enforcement (brief_meeting)

`brief_meeting.ambiguous_items[].quoted_span.text` MUST equal
`input.transcript[start_char:end_char]`. The server validates this on every
response (including its own deterministic output) and raises
`VERBATIM_ANCHOR_FAILED` rather than fabricating ambiguity that is not in the
transcript. This is anti-hallucination armour required by plan.md §7.

## References

- Spec: Section 7.
- Tool design rationale: `docs/decisions/0005-translation-tool-design.md`.
- Authoritative schemas: `packages/mcp-translation/schemas/`.

## Running

```sh
uv run neurodock-mcp-translation
```

The server speaks the MCP stdio transport.

Smoke test:

```sh
uv run python -c "from neurodock_mcp_translation import server; print(server.app.name)"
# neurodock-mcp-translation
```

## Development

```sh
uv sync --all-packages --all-extras
uv run pytest packages/mcp-translation/tests/ -v
uv run ruff check packages/mcp-translation/
uv run ruff format --check packages/mcp-translation/
uv run mypy --strict packages/mcp-translation/src/
```

## Known limitations (v0.0.2)

- No language packs. The deterministic heuristics are English-only. BCP-47
  `target_language` is accepted but only passed through to the prompt.
- No `model_provenance` from a real LLM. The deterministic analysis sets
  `mode="unknown"` on every response; a connected LLM client is responsible
  for setting this in the refined response.
- No eval-corpus integration yet. The `eval_corpus_slice` paths are recorded
  on every response but the slices themselves are owned by `eval-curator` and
  land in Phase 2.
- No streaming. Long meeting transcripts (>200k chars) must be chunked by the
  caller.
- The four schemas under `schemas/` are the v0.1.0 wire contract; the v0.0.2
  envelope wraps them and will collapse to the wire contract once the
  Phase 2 LLM-refinement flow is the default path.
