---
"@neurodock/core": minor
---

feat(evals): add per-neurotype eval slices (r6)

`neurodock-evals` (python, pypi — versioned independently in
`packages/evals/pyproject.toml`, bumped 0.0.2 → 0.0.3) can now slice and score
the translation corpus per neurotype, in addition to the existing per-tool
slices. carrier changeset on `@neurodock/core` per the established convention
for python-package changes (the package is not in the pnpm workspace).

every change is additive and optional per adr 0011:

- examples gain an optional top-level `neurotypes` array using the canonical
  profile enum (`adhd`, `asd`, `audhd`, `ocd`, `dyslexia`, `dyspraxia`,
  `tourette`, `other`). an example with no tag loads and scores exactly as
  before and is absent from every per-neurotype aggregation (backward-compat
  test included). the example `$id` is unchanged.
- `scoring.neurotype_scores` aggregates run results by the neurotype(s) each
  example targets; the harness prints a per-neurotype summary and writes a
  `neurotype_scores` array (labels + counts + scores only — no example body)
  into the report. new `NeurotypeScore` model + optional
  `ScoreReport.neurotype_scores` field (defaults to `[]`).
- new `translation/neurotype` seed slice bound to `translate_incoming`: 14
  synthesised seeds, two each for the seven neurotypes with extension addenda,
  authored under the existing consent + anonymisation conventions.
- the per-neurotype slice joins the `--ci` sweep; the eval gate reports per-type
  results on every `mcp-translation` prompt pr. the threshold stays permissive
  (default 0.6): r6 ships per-type measurement, not a hard per-type gate.

the `annotation.schema.json` rater enum (`dyslexic`/`dyspraxic`, no `tourette`)
is intentionally left unchanged; aligning it to the canonical profile enum is a
schema-breaking change deferred to a future major bump.
