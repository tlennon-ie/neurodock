# Changelog

All notable changes to `neurodock-mcp-translation` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package follows semantic versioning per .

## [0.2.1] - 2026-05-31

- Republish the PyPI README carrying the `mcp-name:` marker so the MCP Registry can verify io.github.tlennon-ie ownership.

### Added — opt-in HTTP transport (ADR 0009 Phase 2)

`main()` can now run over **Streamable HTTP** in addition to stdio. The default is
unchanged: with no HTTP signal it runs **stdio**, byte-for-byte identical to before.
HTTP is opt-in via the `NEURODOCK_HTTP` env var (truthy `1`/`true`/`yes`/`on`,
case-insensitive) or a `--http` flag, binding `NEURODOCK_HTTP_HOST` (default
`127.0.0.1`) and `NEURODOCK_HTTP_PORT` (default `8000`). No auth yet — the bare flag
binds to localhost only (ADR 0009 §3). Transport selection lives in a new pure
`transport.py` helper shared (by identical copy) across the three stateless servers.

## [0.2.0] - 2026-05-25 — translate-not-summarize, for real this time

The 0.1.0 / v0.2.0-schema ship added `content_translation` as an OPTIONAL
field on `describe_image` and `brief_meeting`. The schema landed; the
behaviour did not. User dogfooded the post-ship build on a Harness
"Feature Flags: An Essential Guide" documentation page and on two
different local models got back layout-summary outputs with
`content_translation: null`.

Diagnosis (see `.claude-reports/2026-05-25-translate-still-broken/DIAGNOSIS.md`):

1. The `describe_image.prompt.md` opened with a one-sentence framing
   followed by a long schema-describing section. Local 4B-class models
   obey roles; the prompt did not declare one.
2. The required-keys list put `description` first and added a
   parenthetical demotion of `content_translation`. Models walked the
   list literally.
3. The only worked example was an EI infographic with explicit
   input/action/goal phrasing pre-baked. Document-page screenshots had
   no anchor.
4. The schema permitted `content_translation: []` — a small-model escape
   hatch that bypassed the field entirely.

Changes in this minor bump:

- `prompts/describe_image.prompt.md` rewritten — leads with the user's
  verbatim "Cognitive Accessibility Expert" role + Crucial Rules. Adds
  a DECORATIVE / INSTRUCTIONAL / DATA-VIZ decision tree. Adds a worked
  example for the Harness Feature Flags page (the exact failure case).
  Demotes the legacy `description` / `key_elements` / `transcribed_text`
  fields as "accessibility-tech metadata, NOT the primary output".
- `prompts/brief_meeting.prompt.md` rewritten — same Cognitive
  Accessibility Expert framing. `content_translation` is now the
  priority output; legacy four sections become accessibility-audit
  metadata.
- `schemas/describe_image.schema.json` and `schemas/brief_meeting.schema.json`:
  add `minItems: 1` to the array branch of `content_translation`. Empty
  arrays are rejected; null remains permitted; legacy responses that
  omit the field still validate. Schema $id stays at v0.2.0 — this is a
  behavioural tightening, not a wire-shape change.
- `pyproject.toml` → `version = "0.2.0"` to match the schema.

Back-compat: legacy `content_translation: null` continues to validate.
The only newly-rejected shape is `content_translation: []` which was
never useful.

## [0.1.0] - 2026-05-25

### Added — translate-not-summarise: `content_translation` on describe_image and brief_meeting

User-reported dogfood: `describe_image` on a structured infographic
("8 Ways to Display Emotional Intelligence") returned an OCR-style
single-sentence summary instead of the per-point Input/Action/Goal
scaffold a neurodivergent reader needs to act on the content. Diagnosis
was structural — the v0.1.0 schema had nowhere to put a per-item
explanation scaffold. Same shape problem affects `brief_meeting`'s
flat ask/decision lists.

This is a minor (additive) bump. Legacy responses without the new field
still validate.

- `schemas/describe_image.schema.json` → `version: 0.2.0`. Adds optional
  `content_translation: TranslatedEntry[] | null` to the output, plus
  `$defs.TranslatedEntry` and `$defs.TranslatedFacet`. Facet `kind` enum:
  `input`, `action`, `goal`, `rule`, `fact`, `benefit`, `context`. Field
  is populated for structured content (lists, frameworks, flowcharts,
  infographics) and set to `null` for decorative imagery.
- `schemas/brief_meeting.schema.json` → `version: 0.2.0`. Adds the same
  optional `content_translation` field plus the same `$defs` shapes. Each
  entry's `label` SHOULD reference which list item it translates
  (`my_asks[0]: migration script`) so the reader can map back to the
  verbatim-anchored source.
- `prompts/describe_image.prompt.md` rewritten with explicit
  TRANSLATE-not-SUMMARISE framing and a worked counter-example showing
  the EI infographic case. The legacy `description` / `key_elements` /
  `transcribed_text` fields still fire so accessibility tooling does not
  regress.
- `prompts/brief_meeting.prompt.md` extended with an additive
  `content_translation` instruction.

Verbatim-anchor enforcement on `brief_meeting.ambiguous_items` is
unchanged. The server still performs no LLM calls — the new field is a
prompt-asset / schema-shape pair, executed by the caller's MCP client
exactly like every other field.

## [0.0.2] - 2026-05-22

### Changed

- README rewritten for the PyPI surface. ADR references switched from relative
  paths under `../../docs/decisions/` (which rendered as 404s on pypi.org) to
  absolute GitHub URLs. Same fix shipped across all five NeuroDock MCP server
  READMEs in this release cycle.
- Added `[project.urls]` block to `pyproject.toml` so the PyPI sidebar shows
  Homepage, Documentation, Repository, Issues, and Changelog links.

No behaviour change. Same tools, same schemas, same wire contract.

## [0.0.1] - 2026-05-17

### Added

- Initial deterministic-baseline implementation of all four translation MCP
  tools defined Section 7 and ADR
  [`0005-translation-tool-design.md`](../../docs/decisions/0005-translation-tool-design.md):
  - `translate_incoming(text, channel?, thread_context?, target_language?)` —
    regex-based ambiguity detection (`can we revisit`, `circle back`,
    `let me know your thoughts`, `no rush`, `quick one`, ...), explicit-ask
    extraction from question-marked clauses, and a coarse recommended next
    action.
  - `check_tone(text, baseline_messages?, target_register?, channel?)` —
    word-list-based scoring on the directness / warmth / urgency axes, with
    a >25 percentage-point flagging threshold relative to baseline messages.
  - `rewrite_outgoing(text, target_register, preserve_terms?, channel?, preserve_intent?)` —
    register-specific surface transforms (relational opener for `warm`,
    blunt-opener strip for `direct`, hedge removal for `concise`, contraction
    expansion for `formal`, clarifying-question reframe for `clarifying`),
    plus exact-substring verification of every `preserve_terms` entry.
  - `brief_meeting(transcript, me, project?, speakers?)` — line-indexed
    transcript scan that partitions asks, decisions, and ambiguous items
    into the four-section brief, with verbatim-anchor enforcement on every
    ambiguous item (`VERBATIM_ANCHOR_FAILED` on slice mismatch).
- LLM-refinement prompt templates as `.prompt.md` resources, one per tool,
  rendered with the deterministic baseline summary embedded so a caller's
  MCP client can either use the deterministic answer or refine it against
  its own configured LLM.
- Pydantic models (`types.py`) that mirror the JSON Schemas under
  `packages/mcp-translation/schemas/` (the v0.1.0 wire contract from
  ADR 0005). The v0.0.1 response envelope wraps these as
  `{deterministic_analysis, prompt_for_llm_refinement, eval_corpus_slice}`.
- FastMCP server entrypoint exposed as the `neurodock-mcp-translation`
  console script and importable as `neurodock_mcp_translation.server.app`.
- Protocol conformance test that validates every tool's
  `deterministic_analysis` payload against the v0.1.0 output sub-schemas
  under `packages/mcp-translation/schemas/`.
- 29 tests across the four tools plus protocol conformance; 91% line
  coverage overall, 92-100% on each tool file.

### Design notes

- Per ADR 0005 §1 (and the now-load-bearing precedent across `mcp-chronometric`,
  `mcp-cognitive-graph`, and this server), the server imports **no LLM
  vendor SDK**. The substrate is provider-agnostic. Verified via grep of the
  source tree for `import anthropic | import openai | import ollama |
import langchain | import litellm`: zero hits.
- The server never logs input text. Tool invocations emit a single
  `tool_invoked` log line with the tool name only.
- All character offsets in spans and quoted spans are zero-indexed,
  `start_char` inclusive, `end_char` exclusive, consistent with ADR 0005 §8.
- The verbatim-anchor enforcement runs on the deterministic baseline as well
  as the LLM-refined response (the server validates whatever it returns).

### Known limitations / deferred to v0.1.0+

- **No real LLM refinement flow yet.** The server returns the prompt; the
  caller's MCP client is expected to execute it. Wiring the refinement loop
  (and merging the LLM response back into the envelope) is Phase 2 work and
  requires the eval corpus to validate prompt regressions.
- **English-only heuristics.** BCP-47 `target_language` is accepted as input
  and rendered into the prompt, but the deterministic ambiguity / tone
  scoring word lists are English-only. Hiberno-English, German directness,
  and Japanese keigo packs land as plugins per plan.md §4 / open question 3
  in ADR 0005.
- **No `mcp-cognitive-graph` integration.** `check_tone.baseline_messages` is
  caller-supplied in v0.0.1 (per the ADR's recommended resolution to open
  question 1). A skill MAY wrap the call and inject baselines from the
  cognitive graph; the server does not.
- **No streaming.** Long meeting briefs return as a single response.
- **No eval corpus yet.** Every response carries an `eval_corpus_slice` path,
  but the slices themselves are owned by `eval-curator` and populated in
  Phase 2. CI does not yet gate prompt changes on the corpus.
- **No language-pack registration.** Open question 3 in ADR 0005 deferred to a
  separate ADR.
- **Inline-draft `recommended_next_action.draft_reply` is always null in the
  deterministic baseline.** The LLM refinement may populate it; the
  deterministic path does not draft.
- **`brief_meeting` decision detection is regex-based and conservative.** Some
  decisions phrased without explicit commitment language ("Wednesday it is.")
  will be missed by the baseline and surface only via LLM refinement.
