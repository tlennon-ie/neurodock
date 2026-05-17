---
"@neurodock/core": patch
---

# neurodock-evals v0.0.1 — harness + corpus structure

First release of `neurodock-evals` (Python, PyPI). The harness scaffold and
seed-corpus structure that Phase 2 prompt regressions will gate against.

- Harness modules: `harness.py`, `corpus.py`, `runner.py`, `scoring.py`, `anonymise.py`, `dedupe.py`, `types.py`.
- JSON Schemas: `schemas/example.schema.json`, `schemas/annotation.schema.json`.
- Ten hand-authored synthesised seed examples across four translation slices (incoming, tone, outgoing, meetings), including a multi-rater agreement metric demo.
- `corpora/guardrail/` placeholder for the Phase 3 clinical field-study corpus.
- `CONTRIBUTING.md` describing the consent + anonymisation pipeline.
- Pytest coverage of corpus load, anonymisation, dedupe, runner, scoring, and the harness CLI.

Real contributed corpora are explicitly **not** in v0.0.1 — they are gated on
. CI thresholds ship permissive; tuning follows real
contributions.

References: `packages/evals/CHANGELOG.md`.

The `@neurodock/core` patch above is bookkeeping; the actual artefact ships
to PyPI.

## Open questions before publish

- None blocking the harness release. HuggingFace publication of any
  contributed corpora is deferred to v0.1.0 once consented examples arrive.
