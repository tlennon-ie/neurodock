---
"@neurodock/core": minor
---

add the shared, language-neutral neurotype-shaping artifact + assembler (r1 part a, adr 0012)

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
