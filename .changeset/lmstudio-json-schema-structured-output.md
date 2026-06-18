---
"@neurodock/extension-browser": patch
---

fix(extension): use lm studio structured output (json_schema) so small local models stop failing validation

The LM Studio provider was the only provider that requested plain `text`
output instead of constrained JSON. Capable models followed the
"return only JSON" instruction, but small local models (e.g.
`gemma-4-e4b`) routinely emitted prose, so `extractJson` found no JSON
object and every call failed with
`LLM_OUTPUT_VALIDATION_FAILED (Could not locate a JSON object in the
model completion.)` — while the same request worked fine on OpenRouter.

LM Studio's own 400 ("must be `'json_schema'` or `'text'`") points to the
fix: it supports OpenAI-style structured output. The provider now sends
`response_format: { type: "json_schema", json_schema: { name, strict,
schema } }`, which grammar-constrains decoding (GBNF under the hood) so
even a 4B model is forced to produce schema-valid JSON.

- New `modelFacingSchema(tool)` builds the structured-output schema with
  the server-owned fields (`model_provenance`, `eval_corpus_slice`)
  stripped, so a `strict` grammar can't force the model to hallucinate
  provenance (ADR 0005). Those fields are still injected by
  `normaliseLLMOutput` after parsing.
- Graceful fallback: if a server/model rejects structured output with a
  400 that names `response_format`/`json_schema`, the provider retries
  once in plain-text mode (mirrors the OpenRouter and Google providers).
  Unrelated 400s still surface as real errors.
- Validation now drops stray properties at any nesting level
  (`removeAdditional: "all"` in the compiled validators) instead of
  rejecting. llama.cpp's GBNF grammar doesn't enforce
  `additionalProperties: false` on nested objects, so a small model adding
  a stray key to e.g. a `content_translation[].facets[]` entry no longer
  fails an otherwise-valid response. Required fields and value constraints
  (types, enums) are still enforced — the recursive version of the
  existing top-level field stripping.
