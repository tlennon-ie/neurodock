# Changelog

All notable changes to `neurodock-evals`. Format loosely follows
[Keep a Changelog](https://keepachangelog.com).

## [0.0.3] — unreleased

### Added (R6 — per-neurotype eval slices)

- **Optional `neurotypes` tag on every example** (additive per ADR 0011). A
  cross-cutting tag using the canonical profile enum (`adhd`, `asd`, `audhd`,
  `ocd`, `dyslexia`, `dyspraxia`, `tourette`, `other`). Examples without the
  tag load and score exactly as before — asserted by a back-compat test.
- **Per-neurotype scoring + reporting.** `scoring.neurotype_scores` aggregates
  run results by the neurotype(s) each example targets, cross-cutting the
  per-tool `SliceScore` rows. The harness prints a per-neurotype summary and
  writes a `neurotype_scores` array (labels + counts + scores only) into the
  report. New `types.NeurotypeScore` model and `ScoreReport.neurotype_scores`
  field (defaults to `[]`, so older reports/readers are unaffected).
- **`translation/neurotype` seed slice** bound to `translate_incoming`: 14
  synthesised seeds, two each for the seven neurotypes that have extension
  addendum blocks (`adhd`, `asd`, `audhd`, `ocd`, `dyslexia`, `dyspraxia`,
  `tourette`). Authored under the same consent + anonymisation conventions as
  the other seeds (`status: synthesised`, `sha256:`-prefixed synthesised
  consent token, `anonymisation_pass: 1`, pseudonymous contributor id).
- **CI wiring.** The per-neurotype slice joins the `--ci` sweep via
  `SLICE_TO_TOOL`; the eval gate reports per-type results on every
  `mcp-translation` prompt PR. The pass threshold stays **permissive** (default
  0.6) — R6 ships per-type measurement, not a hard per-type gate.
- `.eval-reports/` added to `.gitignore` so generated reports are never
  committed.

### Known follow-up

- The `annotation.schema.json` rater enum predates the canonical profile enum
  (`dyslexic`/`dyspraxic`, no `tourette`). Tourette/dyslexia/dyspraxia seed
  raters self-ID with the closest valid v0.0.1 annotation value (`other`,
  `dyslexic`, `dyspraxic` respectively); aligning the annotation enum is a
  separate, schema-breaking change deferred to a future major bump.

## [0.0.2] — 2026-05-17

### Changed

- **`neurodock-mcp-translation` moved to an optional `[translation]` extra.**
  The runner imports the translation tools lazily, so a hard runtime dependency
  meant `pip install neurodock-evals` failed whenever translation was
  unpublished or missing. The core harness now installs on its own; the
  translation runner is opt-in:

  ```
  pip install neurodock-evals              # core harness only
  pip install neurodock-evals[translation] # with the translation runner
  ```

  No corpus or schema changes — this is a packaging-only release on top of the
  0.0.1 scaffold + synthesised seed examples.

## [0.0.1] — 2026-05-17

### Added

- Initial harness scaffold: `harness.py`, `corpus.py`, `runner.py`, `scoring.py`,
  `anonymise.py`, `dedupe.py`, `types.py`.
- JSON Schemas: `schemas/example.schema.json`, `schemas/annotation.schema.json`.
- Ten hand-authored, **synthesised** seed examples across four translation
  slices: `translation/incoming/` (3), `translation/tone/` (2),
  `translation/outgoing/` (2), `translation/meetings/` (3, including a
  multi-rater agreement metric demonstration).
- `corpora/guardrail/` placeholder for the .
- `CONTRIBUTING.md` describing the consent + anonymisation pipeline.
- Pytest suite covering corpus load, anonymisation, dedupe, runner, scoring,
  and harness CLI.

### Not yet

- Real contributed corpora — gated on the pipeline.
- HuggingFace publication — deferred to v0.1.0.
- Tuned CI thresholds — the harness ships with permissive defaults; tuning
  follows the first real contributions.
- rater agreement metric adjudication workflow beyond a single demo example.
