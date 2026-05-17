---
"@neurodock/core": patch
---

# mcp-translation v0.0.1 — first cut

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

References: `plan.md` §7, ADR 0005, `packages/mcp-translation/CHANGELOG.md`.

The `@neurodock/core` patch above is bookkeeping so the TS workspace records
this Python-package release; the actual artefact ships to PyPI.

## Open questions before publish

- None blocking. Eval corpus arrival (Phase 2) will gate prompt regressions in
  CI, but does not gate this developer-preview release.
