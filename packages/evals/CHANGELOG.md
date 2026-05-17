# Changelog

All notable changes to `neurodock-evals`. Format loosely follows
[Keep a Changelog](https://keepachangelog.com).

## [0.0.1] — 2026-05-17

### Added

- Initial harness scaffold: `harness.py`, `corpus.py`, `runner.py`, `scoring.py`,
  `anonymise.py`, `dedupe.py`, `types.py`.
- JSON Schemas: `schemas/example.schema.json`, `schemas/annotation.schema.json`.
- Ten hand-authored, **synthesised** seed examples across four translation
  slices: `translation/incoming/` (3), `translation/tone/` (2),
  `translation/outgoing/` (2), `translation/meetings/` (3, including a
  multi-rater Cohen's kappa demonstration).
- `corpora/guardrail/` placeholder for the clinical-reviewer field study.
- `CONTRIBUTING.md` describing the consent + anonymisation pipeline.
- Pytest suite covering corpus load, anonymisation, dedupe, runner, scoring,
  and harness CLI.

### Not yet

- Real contributed corpora — gated on the Phase 2 outreach pipeline.
- HuggingFace publication — deferred to v0.1.0.
- Tuned CI thresholds — the harness ships with permissive defaults; tuning
  follows the first real contributions.
- ND-rater Cohen's kappa adjudication workflow beyond a single demo example.
