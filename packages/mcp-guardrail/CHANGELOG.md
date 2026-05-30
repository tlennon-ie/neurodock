# Changelog

All notable changes to `neurodock-mcp-guardrail` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package follows semantic versioning.

## [unreleased]

### Added — opt-in HTTP transport (ADR 0009 Phase 2)

`main()` can now run over **Streamable HTTP** in addition to stdio. The default is
unchanged: with no HTTP signal it runs **stdio**, byte-for-byte identical to before.
HTTP is opt-in via the `NEURODOCK_HTTP` env var (truthy `1`/`true`/`yes`/`on`,
case-insensitive) or a `--http` flag, binding `NEURODOCK_HTTP_HOST` (default
`127.0.0.1`) and `NEURODOCK_HTTP_PORT` (default `8000`). No auth yet — the bare flag
binds to localhost only (ADR 0009 §3). Detector logic, thresholds, and schemas are
unchanged. Transport selection lives in a new pure `transport.py` helper shared (by
identical copy) across the three stateless servers.

## [0.0.3] - 2026-05-22

### Changed

- README rewritten for the PyPI surface. ADR references switched from relative
  paths under `../../docs/decisions/` (which rendered as 404s on pypi.org) to
  absolute GitHub URLs. Same fix shipped across all five NeuroDock MCP server
  READMEs in this release cycle.
- Added `[project.urls]` block to `pyproject.toml` so the PyPI sidebar shows
  Homepage, Documentation, Repository, Issues, and Changelog links.

No behaviour change. Same tools, same schemas, same wire contract.

## [0.0.2] - 2026-05-17

### Added

- **`check_hyperfocus` is now live.** Replaces the v0.0.1
  `DETECTOR_NOT_YET_IMPLEMENTED` stub with the
  `elapsed_threshold_with_eod` heuristic (version `0.2.0`).
  Defaults: 90-minute break threshold scaled to a four-rung ladder
  (none < gentle < nudge < hard) at 60% / 100% / 133% of the break.
  When `end_of_day_local` is supplied and `now` is past it, the level
  escalates one rung (gentle->nudge, nudge->hard). `prior_intent` is
  quoted verbatim per ADR 0001. Source:
  `src/neurodock_mcp_guardrail/heuristics/hyperfocus.py`.
- **`check_sycophancy` is now live.** Replaces the v0.0.1 stub with a
  five-pattern detection pipeline (version `0.2.0`) evaluated in fixed
  order: `repeated_reassurance_request`, `unconditional_agreement`,
  `praise_without_evidence`, `escalating_validation`, with an `other`
  soft-signal catch-all. All phrase lists live in
  `src/neurodock_mcp_guardrail/heuristics/_phrases.py` and are
  clinical-review-gated per ADR 0006 and `ETHICS.md` commitment 3.
- Override-option helper functions `hyperfocus_override_options(...)` and
  `sycophancy_default_override_options()` in
  `src/neurodock_mcp_guardrail/overrides.py`.
- Hyperfocus `gentle` rung surfaces `disable-for-session`; `nudge` and
  `hard` surface the full canonical four-token set
  (`snooze-15m`, `commit-and-close`, `extend-end-of-day`,
  `disable-for-session`).
- Sycophancy detection surfaces the canonical five-token set
  (`i-want-validation`, `override-once`, `fresh-context`,
  `disable-for-session`, `explain-the-match`).

### Changed

- `SERVER_VERSION` bumped to `0.0.2`.
- `check_sycophancy` runtime no longer raises
  `DetectorNotYetImplementedError`. The class is retained as a no-op
  type for v0.0.1 caller compatibility; it will be removed in v0.1.0.
- `check_hyperfocus` runtime no longer raises the same error; it now
  returns a fully-populated `HyperfocusOutput`.
- Protocol conformance tests exercise the live detectors and validate
  every response payload against the JSON schema.

### Heuristic versions shipped

| Detector           | Heuristic name                  | Version             |
| ------------------ | ------------------------------- | ------------------- |
| `check_rumination` | `word_overlap_jaccard`          | `0.1.0` (unchanged) |
| `check_hyperfocus` | `elapsed_threshold_with_eod`    | `0.2.0` (new)       |
| `check_sycophancy` | (5 heuristics, see schema enum) | `0.2.0` (new)       |

### Server invariants (unchanged from v0.0.1)

- **Stateless.** No SQLite, no JSONL, no in-memory caches.
- **No user content in logs.** Only `tool_invoked` metadata at INFO.
- **Override-token vocabulary is closed.** Per ADR 0006 section 2.
- **Clinical review gate.** Changes to
  `src/neurodock_mcp_guardrail/heuristics/` require
  `clinical-reviewer` sign-off per ADR 0006 and `ETHICS.md`
  commitment 3.

### Known limitations

- Hyperfocus end-of-day comparison uses local-clock-only semantics
  (HH:MM on `now`'s local date). Multi-timezone scenarios where the
  user crosses midnight are not yet handled; deferred to v0.0.3.
- Sycophancy phrase matching is surface-form (case-insensitive substring
  / start-of-string). Paraphrases of the canonical openers will not
  fire; the field-study corpus calibrates whether this is acceptable
  per ADR 0006 open question 1.

## [0.0.1] - 2026-05-17

### Added

- Initial Phase-2 implementation of the guardrail MCP server, per
  [`docs/decisions/0006-guardrail-tool-design.md`](../../docs/decisions/0006-guardrail-tool-design.md):
  - `check_rumination(current_prompt, history, ...)` - word-overlap Jaccard
    detection over a rolling window. Defaults: window 90 minutes, threshold
    count 3, similarity threshold 0.55. Returns a structured advisory
    signal, never blocks the user.
  - `check_hyperfocus(chronometric_snapshot, ...)` - schema-only stub;
    runtime returns `DETECTOR_NOT_YET_IMPLEMENTED` with `phase: "3"`
    metadata.
  - `check_sycophancy(candidate_response?, recent_user_messages?, ...)` -
    same pattern as `check_hyperfocus`. Enforces the `anyOf` constraint
    (`INPUT_MISSING` error) before falling through to the stub.
- Pydantic types in `types.py` that mirror the JSON Schemas.
- Word-overlap Jaccard heuristic in
  `neurodock_mcp_guardrail.heuristics.rumination` with a hand-rolled
  60-word English stoplist.
- Closed v0.1.0 override-token vocabulary in
  `neurodock_mcp_guardrail.overrides` for all three tools.
- FastMCP server exposed as the `neurodock-mcp-guardrail` console script
  and importable as `neurodock_mcp_guardrail.server.app`.
- Protocol conformance tests.
