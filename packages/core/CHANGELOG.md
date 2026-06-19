# @neurodock/core

## 0.2.0

### Minor Changes

- 8239692: feat(mcp-chronometric): consume the r5 chronometric profile fields

  `neurodock-mcp-chronometric` (Python, PyPI) now reads and honours the optional
  `chronometric` profile fields added in r5 part a, alongside the existing
  `privacy.os_idle_consent`. Every change is additive and optional per adr 0011:
  new output fields only, never a change to an existing field, and never a
  neurotype branch. a profile that declares none of the new fields produces the
  exact pre-r5 wire shape on every tool (covered by a backward-compat test).

  read from `profile.chronometric`:

  - `weekday_overrides` — today's entry re-anchors the effective `end_of_day_local`
    and `hyperfocus_break_minutes` on top of the base values; an absent or empty
    override inherits the base.
  - `protected_windows` — local-time ranges (midnight-wrap supported when
    `end` < `start`) where the break logic hard-surfaces.
  - `calendar_phase`, `deadline_cluster_awareness`, `motor_fatigue_aware` — surfaced.

  tool output changes (all additive optional, omitted when unset):

  - `get_time_context` — `effective_end_of_day_local`, `past_end_of_day`,
    `calendar_phase`, `deadline_cluster_awareness`, `motor_fatigue_aware`.
  - `request_break_if_needed` — `escalation` (`nudge` | `hard_surface`) and
    `protected_window_label`; hard-surfaces when the current local time is inside
    a protected window, even below the threshold.
  - `idle_status` — `motor_fatigue_aware` (a declared preference, surfaced
    regardless of consent; the server has no keystroke/click stream so reading
    actual motor activity stays gated by `os_idle_consent`).

  `time_buffer_multiplier` is intentionally not consumed here — it belongs to the
  task-fractionator. json schemas under `packages/mcp-chronometric/schemas/` and
  the pydantic models are updated together and validated by the protocol
  conformance test.

- e3a92b0: feat(evals): add per-neurotype eval slices (r6)

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

- 12331e3: add the shared, language-neutral neurotype-shaping artifact + assembler (r1 part a, adr 0012)

  extracts the per-(tool x neurotype) prompt-shaping content that previously
  lived hard-coded inside the browser extension into a single source of truth in
  `@neurodock/core`, so every neurodock surface (the extension today, the
  mcp-translation server in a follow-up pr) shapes per-neurotype responses
  identically.

  new artifact + schema:

  - `data/neurotype-addenda/v1.json` — the canonical, enum-keyed content:
    every per-(tool x neurotype) block (translate_incoming, check_tone,
    rewrite_outgoing, brief_meeting, describe_image), the `audhd` fusion rule,
    the priority ordering, the 3+ conflict footer, the cross-cutting
    voice-input block, the tourette / other special blocks, the generic
    fallbacks, and the output-format guidance. the only interpolation tokens
    are `{max_chunk_size}` and `{notes}`. `artifact_version: "1.0.0"`.
  - `schemas/neurotype-addenda.schema.json` — draft-2020 schema validating
    the artifact (additive-only versioning; `additionalProperties: true` for
    forward-compat). a core test validates v1.json against it with ajv.

  new exports:

  - `assembleNeurotypeAddendum(artifact, options)` — a pure function that
    reproduces the extension's assembly exactly (fusion -> priority order ->
    per-tool blocks with generic fallback -> tourette/other specials ->
    voice-input cross-cutting block -> conflict footer -> token
    interpolation).
  - `neurotypeAddendaV1` — the typed v1 artifact, re-exported so consumers
    bundle the canonical content through core without re-reading the json.
  - artifact types (`NeurotypeAddendaArtifact`, `AssembleNeurotypeAddendumOptions`,
    and the block/section types).

  this is enum-keyed content, not schema shape (adr 0011): no profile schema
  fork, no field constraints. no runtime dependency added — the artifact is plain
  json imported at build time and the assembler is pure typescript; ajv / yaml
  stay dev-only test dependencies. the artifact ships in the published package
  (`files` now includes `data`). `src/index.ts` `version` constant bumped to
  `0.1.0` to stay joined with `package.json`.

- 238ef15: add eight optional per-neurotype tailoring fields to the profile schema (adr 0011)

  promotes the eight fields previously tracked as "candidate fields for a future
  schema bump" in `profiles/README.md` from documented intent to real, optional,
  additive schema fields. per adr 0011 (and the additive-only contract of adr
  0004 / adr 0005), every field is optional, never required, and never
  type-narrowing, so an existing v0.1.0 profile that carries none of them keeps
  validating unchanged.

  under `preferences`:

  - `line_height_hint` — `"compact" | "default" | "relaxed"` categorical
    line-height hint for rich-text clients, alongside `reading_font_hint`.
  - `voice_input_preferred` — boolean; when true, skills keep examples
    copy-pasteable as a single block (dictation-first users).

  under `chronometric`:

  - `calendar_phase` — `"teaching" | "marking" | "exam" | "deadlines" | "break"`.
  - `weekday_overrides` — per-weekday overrides for `end_of_day_local` and
    `hyperfocus_break_minutes` (weekday-keyed object; override objects reject
    unknown keys).
  - `protected_windows` — list of `{ start, end, label? }` local-time ranges
    where the hyperfocus monitor should hard-surface rather than nudge.
  - `deadline_cluster_awareness` — boolean.
  - `time_buffer_multiplier` — number 1.0–3.0, neutral default 1.0.
  - `motor_fatigue_aware` — boolean, neutral default false.

  the schema stays at `$id` `.../profile/v0.1.0/...`: per adr 0004 the `$id`
  only changes on a major bump, and additive optional fields are backward-
  compatible within the v0.1.x line. no `$id` references elsewhere in the repo
  needed changing.

  also exports hand-written `Profile` typescript types (with the new optional
  fields) from `@neurodock/core`, linked to the schema by a runtime-assertion
  test so the two cannot drift. no runtime dependency added — ajv / ajv-formats /
  yaml are dev-only test dependencies.

  note for the release commit: this changeset bumps `package.json` to `0.1.0`;
  the `version` constant in `src/index.ts` must be bumped to match in the same
  commit (the two are joined).

- 3cee0d0: feat(mcp-task-fractionator): optional neurotype hooks on decompose (r2)

  `neurodock-mcp-task-fractionator` (Python, PyPI) `decompose` gains three
  optional, additive inputs that let decomposition respect the user's knobs.
  Every change is additive and optional per adr 0011: new optional inputs and
  new output fields only, never a change to an existing field, and never a
  neurotype branch. a call with none of the new inputs returns the exact pre-r2
  wire shape (covered by a backward-compat test).

  new optional inputs:

  - `max_chunk_size` (1-20) — caps the number of tasks returned below the normal
    3-12 target. when the goal naturally needs more steps the server keeps the
    lowest-sequence prefix (a valid sub-dag, dangling deps filtered), sets the
    new optional `truncated` flag, and names the truncation in the rationale —
    never a silent drop or an invalid topo order.
  - `time_buffer_multiplier` (1.0-3.0) — when > 1.0, each task gains an additive
    `padded_minutes` = round(estimated_minutes × multiplier). `estimated_minutes`
    stays raw so a presentation layer (the dyspraxia-task-pacer skill) never
    double-pads. multiplier echoed and named in the rationale. 1.0 is a no-op.
  - `motor_fatigue_aware` (bool) — echoed and named in the rationale; the server
    has no keystroke/click stream and does not infer fatigue (honest scoping,
    mirroring mcp-chronometric #103).

  tool output changes (all additive optional, omitted when the knob is inactive):

  - `decompose` — per-task `padded_minutes`; top-level `time_buffer_multiplier`,
    `motor_fatigue_aware`, `truncated`. dumped with `exclude_none=true`.
  - new error `INPUT_INVALID` for an out-of-range knob (rejected, never clamped).
  - `next_one` now also dumps with `exclude_none=true` so the shared
    `Task.padded_minutes` (always unset there) stays off its wire — shape unchanged.

  json schemas under `packages/mcp-task-fractionator/schemas/` and the pydantic
  models are updated together and validated by the protocol conformance test.

- 2e8a634: server-side per-neurotype prompt shaping in mcp-translation (r1 part b, adr 0012)

  carrier changeset on `@neurodock/core` per the established convention for python
  package changes (mcp-translation is not in the pnpm workspace; its version is
  bumped in `packages/mcp-translation/pyproject.toml`, 0.2.2 -> 0.3.0).

  implements the server half of adr 0012 so EVERY mcp client — claude desktop,
  cursor, claude code, any mcp host — gets the same per-neurotype tailoring the
  browser extension already gets, not just the extension. the tailoring content
  stays the single source of truth in `@neurodock/core`
  (`data/neurotype-addenda/v1.json`); the server reads it through a python
  assembler and injects the addendum into the prompt it already returns. no llm
  sdk, no model call (adr 0005 intact).

  what landed in mcp-translation:

  - `addenda.py` — a direct port of core's `assembleNeurotypeAddendum` (fusion ->
    priority -> per-tool block with generic fallback -> tourette/other specials ->
    voice-input block -> 3+ conflict footer -> `{max_chunk_size}` / `{notes}`
    interpolation -> wrapper), proven byte-identical to the typescript assembler.
  - artifact delivery: a byte-identical copy of `v1.json` ships inside the wheel as
    package-data (`src/neurodock_mcp_translation/data/neurotype-addenda/v1.json`);
    `importlib.resources` reads it with no monorepo filesystem dependency, so the
    hosted-remote worker bundles cleanly. an import-time existence check degrades to
    a logged safe default (generic/empty prompt) if the artifact is ever missing —
    never a crash.
  - `profile.py` — a trimmed port of mcp-chronometric's profile reader, reading
    `identity.neurotypes`, `identity.additional_notes`, `preferences.output_format`,
    `preferences.max_chunk_size`, `preferences.voice_input_preferred`. same
    `NEURODOCK_PROFILE_PATH` override / safe-default-on-absence / `profile_unreadable`
    log / defensive-field-parsing discipline.
  - `reader_context` — one optional, additive input on all four tools
    (`neurotypes?`, `output_format?`, `max_chunk_size?`, `voice_input_preferred?`,
    `additional_notes?`), tolerant of unknown keys. resolution precedence is
    field-by-field: `reader_context` per field, else the `profile.yaml` read, else
    nothing. added to the pydantic input models and the four json schemas additively.
  - wiring: each tool appends the assembled addendum to
    `prompt_for_llm_refinement.content` AFTER the schema block (the extension's
    recency ordering). absent BOTH `reader_context` and a profile, the content is
    byte-identical to today's — a load-bearing regression test asserts this. the
    output shape is unchanged (no new required output field; adr 0011 holds).

  anti-drift control (the critical one): a committed parity fixture
  (`packages/core/data/neurotype-addenda/parity-fixtures.json`, 59 cases across the
  4 server tools x representative neurotype combos incl. adhd / asd / adhd+asd ->
  audhd fusion / explicit audhd / ocd / dyslexia / dyspraxia / tourette / other /
  3+ conflict, x voice on-off x chunk-size variants x notes present-absent) is
  generated FROM the typescript assembler (the source of truth). a TS test
  (`packages/core/src/neurotype-addenda.parity.test.ts`) guards the TS side and
  regenerates intentionally; a python test
  (`packages/mcp-translation/tests/test_addenda_parity.py`) asserts the python
  assembler produces the same strings. ts ≠ python is now a red ci build. a second
  guard asserts the wheel's artifact copy stays byte-identical to core's source.

  depends on `pyyaml` (added) for the profile read.

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
