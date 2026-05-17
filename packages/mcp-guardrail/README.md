# neurodock-mcp-guardrail

Clinical guardrails MCP server for NeuroDock. Detects three patterns that
unmodified LLM interaction tends to amplify for neurodivergent users:
rumination loops (OCD), unregulated hyperfocus (ADHD), and sycophancy /
over-validation. See `plan.md` §8 and `ETHICS.md` for the full framework.

## Status

- **v0.0.1 (Phase 2):** `check_rumination` is implemented (word-overlap
  Jaccard). `check_hyperfocus` and `check_sycophancy` ship as schema-only
  stubs; their runtimes return `DETECTOR_NOT_YET_IMPLEMENTED` until the
  Phase-3 field study endorses thresholds per
  [`docs/decisions/0006-guardrail-tool-design.md`](../../docs/decisions/0006-guardrail-tool-design.md).

## Tools

| Tool | Status | Heuristic | Default thresholds |
|---|---|---|---|
| `check_rumination` | live | `word_overlap_jaccard` | window 90 min, count 3, similarity 0.55 |
| `check_hyperfocus` | schema-only (Phase 3) | `elapsed_threshold_with_eod` | 60 / 90 / 120 minutes |
| `check_sycophancy` | schema-only (Phase 3) | four reserved heuristic names | tbd by field study |

## Design invariants

- **Stateless.** The server persists nothing — no SQLite, no JSONL, no
  in-memory caches that survive a call. Callers supply all history.
- **No telemetry, no network sockets.** Per `ETHICS.md` commitment 4.
- **No user content in logs.** Only `tool_invoked` metadata is logged.
- **Override-token vocabulary is closed at v0.1.0.** New tokens require a
  minor bump and `clinical-reviewer` sign-off per ADR 0006 §3 and §10.
- **Heuristics are auditable.** Source for each heuristic lives in
  `src/neurodock_mcp_guardrail/heuristics/`. Changes there require
  `clinical-reviewer` sign-off per `ETHICS.md` commitment 3.

## Usage

```bash
# Run the server over stdio (via the console script):
neurodock-mcp-guardrail

# Or smoke-test the build directly:
python -c "from neurodock_mcp_guardrail import server; print(server.app.name)"
```

## Tests

```bash
uv run pytest packages/mcp-guardrail/tests/ -v
```

Tests cover:

- The Jaccard heuristic (identical, disjoint, stopword-only, paraphrase,
  case-insensitivity, punctuation handling).
- The `check_rumination` tool (empty history, in-window detection,
  out-of-window non-detection, threshold honour, override-token contract,
  history-ordering rejection, false-positive-feedback path).
- The two schema-only stubs (`DETECTOR_NOT_YET_IMPLEMENTED` is raised with
  `phase: "3"` metadata; input shape is validated against the locked
  v0.1.0 schema).
- Protocol conformance: every tool response is validated against the
  schema files in `schemas/`.

## License

AGPL-3.0-or-later.
