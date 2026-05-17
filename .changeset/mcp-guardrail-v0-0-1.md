---
"@neurodock/core": patch
---

# mcp-guardrail v0.0.1 — rumination only

First release of `neurodock-mcp-guardrail` (Python, PyPI). Per 
Phase 2, this ships rumination detection live; `check_hyperfocus` and
`check_sycophancy` are schema-locked stubs that return
`DETECTOR_NOT_YET_IMPLEMENTED` until the Phase 3  endorses
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
- **** on the rumination advisory copy —  . Maintainer confirms before tagging.
