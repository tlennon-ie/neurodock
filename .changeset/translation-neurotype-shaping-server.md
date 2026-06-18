---
"@neurodock/core": minor
---

server-side per-neurotype prompt shaping in mcp-translation (r1 part b, adr 0012)

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
