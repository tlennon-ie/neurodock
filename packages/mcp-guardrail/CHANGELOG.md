# Changelog

All notable changes to `neurodock-mcp-guardrail` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package follows semantic versioning per `plan.md` §4.

## [0.0.1] - 2026-05-17

### Added

- Initial Phase-2 implementation of the guardrail MCP server, per
  [`docs/decisions/0006-guardrail-tool-design.md`](../../docs/decisions/0006-guardrail-tool-design.md):
  - `check_rumination(current_prompt, history, ...)` — word-overlap Jaccard
    detection over a rolling window. Defaults: window 90 minutes, threshold
    count 3, similarity threshold 0.55. Returns a structured advisory
    signal, never blocks the user.
  - `check_hyperfocus(chronometric_snapshot, ...)` — schema-only stub;
    runtime returns `DETECTOR_NOT_YET_IMPLEMENTED` with `phase: "3"`
    metadata. Input is validated against the v0.1.0 schema so callers can
    integrate against the permanent contract today.
  - `check_sycophancy(candidate_response?, recent_user_messages?, ...)` —
    same pattern as `check_hyperfocus`. Enforces the `anyOf` constraint
    (`INPUT_MISSING` error) before falling through to the stub.
- Pydantic types in `types.py` that mirror the JSON Schemas under
  `packages/mcp-guardrail/schemas/`.
- Word-overlap Jaccard heuristic in
  `neurodock_mcp_guardrail.heuristics.rumination` with a hand-rolled
  60-word English stoplist. Implementation is small and auditable per
  `ETHICS.md` commitment 3.
- Closed v0.1.0 override-token vocabulary in
  `neurodock_mcp_guardrail.overrides` for all three tools.
- FastMCP server exposed as the `neurodock-mcp-guardrail` console script
  and importable as `neurodock_mcp_guardrail.server.app`.
- Protocol conformance tests that validate `check_rumination` responses
  against the JSON schema and confirm both stub detectors surface
  `DETECTOR_NOT_YET_IMPLEMENTED`.

### Server invariants (per ADR 0006)

- **Stateless.** No SQLite, no JSONL, no in-memory caches. The server
  persists nothing and exposes no telemetry endpoints.
- **No user content in logs.** Only `tool_invoked` metadata (tool name,
  timestamp) is logged at INFO. Prompts, history, and detection outcomes
  are never logged.
- **Override-token vocabulary is closed.** New tokens require a minor bump
  and clinical-reviewer sign-off.
- **Clinical-reviewer gate.** Changes to
  `src/neurodock_mcp_guardrail/heuristics/` or to `_stopwords.py` require
  `clinical-reviewer` sign-off per ADR 0006 and `ETHICS.md` commitment 3.

### Known limitations

- `check_hyperfocus` and `check_sycophancy` runtimes return
  `DETECTOR_NOT_YET_IMPLEMENTED` until the Phase-3 field study endorses
  the thresholds and patterns (`plan.md` §11).
- The word-overlap Jaccard heuristic misses paraphrases. v0.0.2 introduces
  embedding-based similarity (`embedding_cosine` is already a reserved
  value in the schema's `heuristic.name` enum). See ADR 0006 §6 Option B.
- The English stoplist is the only language supported in v0.1.0. ADR 0006
  open question 6 covers the multi-language plan.
