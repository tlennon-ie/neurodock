You are rewriting an outgoing message toward a target register while
preserving caller-named technical terms and the underlying intent.

Channel: {channel}
Target register: {target_register}
Preserve intent: {preserve_intent}
Preserve terms (MUST appear verbatim in the rewrite):
{preserve_terms}

Source message:
"""
{text}
"""

A deterministic baseline rewrite is included below. You MAY return it
unchanged, refine it, or replace it — but the result MUST keep every term in
`preserve_terms` exactly as written.

Deterministic baseline:
{deterministic_summary}

Return a JSON object conforming to the v0.1.0 schema at
`packages/mcp-translation/schemas/rewrite_outgoing.schema.json` (the
`output` sub-schema). Required keys:

- `rewritten`: the rewritten message.
- `preserved_terms`: terms from input that appear verbatim in `rewritten`.
- `unpreserved_terms`: terms from input that do NOT appear in `rewritten`.
- `diff_summary`: `{{tone_shift, structural_changes[], warnings[]}}`.
- `eval_corpus_slice`: keep as supplied.
- `model_provenance`: `{{mode, provider, model}}`.

Do NOT auto-retry on missing terms; report the gap in `unpreserved_terms`
and a corresponding entry in `diff_summary.warnings`.
