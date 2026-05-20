# neurodock-mcp-guardrail

Clinical guardrails MCP server for NeuroDock. Detects three patterns that
unmodified LLM interaction tends to amplify for neurodivergent users:
rumination loops (OCD), unregulated hyperfocus (ADHD), and sycophancy /
over-validation. See `ETHICS.md` and `MANIFESTO.md` for the full framework.

## Status

- **v0.0.2:** All three detectors are live.
  - `check_rumination` — word-overlap Jaccard heuristic.
  - `check_hyperfocus` — elapsed-threshold-with-end-of-day heuristic.
  - `check_sycophancy` — four-pattern overlap heuristic.

  Heuristics are public and auditable; thresholds are defaults, not
  prescriptions. See ADR 0006 for the rationale.

## Tools

| Tool | Status | Heuristic | Default thresholds |
|---|---|---|---|
| `check_rumination` | live (v0.0.1) | `word_overlap_jaccard` | window 90 min, count 3, similarity 0.55 |
| `check_hyperfocus` | live (v0.0.2) | `elapsed_threshold_with_eod` | 60 / 90 / 120 minutes |
| `check_sycophancy` | live (v0.0.2) | pattern overlap (4 patterns) | similarity 0.5 |

## Design invariants

- **Stateless.** The server persists nothing — no SQLite, no JSONL, no
  in-memory caches that survive a call. Callers supply all history.
- **No telemetry, no network sockets.** Per `ETHICS.md` commitment 4.
- **No user content in logs.** Only `tool_invoked` metadata is logged.
- **Override-token vocabulary is closed at v0.1.0.** New tokens require a
  minor bump and  sign-off per ADR 0006 §3 and §10.
- **Heuristics are auditable.** Source for each heuristic lives in
  `src/neurodock_mcp_guardrail/heuristics/`. Changes there require
   sign-off per `ETHICS.md` commitment 3.

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
- `check_hyperfocus` (escalation level mapping, end-of-day strictness,
  idle-signal handling, override-token contract, schema conformance).
- `check_sycophancy` (each of the four patterns, counter-prompt
  generation, override-token contract, schema conformance).
- Protocol conformance: every tool response is validated against the
  schema files in `schemas/`.

## License

AGPL-3.0-or-later.
