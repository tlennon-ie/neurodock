# @neurodock/core

## 0.0.1

### Patch Changes

- b6a4231: # neurodock-evals v0.0.1 — harness + corpus structure

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

- b6a4231: # mcp-guardrail v0.0.1 — rumination only

  First release of `neurodock-mcp-guardrail` (Python, PyPI). Per
  Phase 2, this ships rumination detection live; `check_hyperfocus` and
  `check_sycophancy` are schema-locked stubs that return
  `DETECTOR_NOT_YET_IMPLEMENTED` until the Phase 3 endorses
  thresholds.
  - `check_rumination` — rolling-window Jaccard word-overlap, default 3 queries in 90 minutes at similarity ≥ 0.55. Advisory only — never blocks.
  - `check_hyperfocus` / `check_sycophancy` — schema validation against the v0.1.0 contract; runtime returns Phase-3 stub.
  - Closed v0.1.0 override-token vocabulary, hand-rolled 60-word English stoplist (auditable per `ETHICS.md` commitment 3).
  - Stateless server. No SQLite, no JSONL, no telemetry. No user content in logs.

  References: ADR 0006, `ETHICS.md`,
  `packages/mcp-guardrail/CHANGELOG.md`.

  The `@neurodock/core` patch above is bookkeeping; the actual artefact ships
  to PyPI.

  ## Open questions before publish — GATING
  - ** sign-off required** on `src/neurodock_mcp_guardrail/heuristics/` and `_stopwords.py` per ADR 0006 and `ETHICS.md` commitment 3. Maintainer must confirm sign-off captured before tagging.
  - \*\*\*\* on the rumination advisory copy — . Maintainer confirms before tagging.

- b6a4231: # mcp-translation v0.0.1 — first cut

  First release of `neurodock-mcp-translation` (Python, PyPI). Implements the
  four-tool translation contract from ADR 0005 against the JSON Schemas under
  `packages/mcp-translation/schemas/`:
  - `translate_incoming` — explicit-ask extraction, regex ambiguity detection, recommended next action.
  - `check_tone` — directness / warmth / urgency scoring on 0–100 axes with a baseline-delta flag at > 25 percentage points.
  - `rewrite_outgoing` — register-specific surface transforms with exact-substring preservation of `preserve_terms`.
  - `brief_meeting` — four-section meeting brief with `VERBATIM_ANCHOR_FAILED` enforcement on every ambiguous quote.

  Provider-agnostic: the server contains no LLM SDK. Each response carries a
  deterministic baseline plus an LLM-refinement prompt the caller can execute
  against its configured model. Engine and tone vocab are English-only in v0.0.1;
  language packs land via plugins (ADR 0007).

  References: ADR 0005, `packages/mcp-translation/CHANGELOG.md`.

  The `@neurodock/core` patch above is bookkeeping so the TS workspace records
  this Python-package release; the actual artefact ships to PyPI.

  ## Open questions before publish
  - None blocking. Eval corpus arrival (Phase 2) will gate prompt regressions in
    CI, but does not gate this developer-preview release.

- b6a4231: # core: plugin protocol schema (ADR 0007)

  Documents the v0.1.0 plugin manifest contract in `@neurodock/core`. No
  runtime code change ships in this release — the schema is a contract for
  Phase 3 to implement against.
  - Six plugin types covered by one manifest: `skill`, `mcp-server`, `profile`, `translation-pack`, `language-pack`, `theme`.
  - Four-tier trust ladder that degrades gracefully when no central registry is reachable (air-gapped installs are first-class).
  - License-compatibility gate: plugin manifests declare a license; the substrate refuses to load license-incompatible plugins.
  - `additionalProperties: true` at every level; loaders preserve unknown keys (ADR 0004 forward-compat pattern carries over).
  - `provides[].type: language-prompt-override` resolves ADR 0005 open question 3 — language packs shadow default translation prompts by locale.

  References: ADR 0004, ADR 0005, ADR 0007.

  ## Open questions before publish
  - None blocking. Federated discovery (`plugins.neurodock.org`) is Phase 3
    work; the manifest is published now so plugin authors can target the
    permanent shape.
