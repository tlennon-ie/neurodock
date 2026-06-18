# translation/ slices

Eval corpora for the four `mcp-translation` tools, per ADR 0005 §4
(eval-corpus binding).

| Slice                   | Tool                 | What it tests                                                               |
| ----------------------- | -------------------- | --------------------------------------------------------------------------- |
| `translation/incoming`  | `translate_incoming` | Subtext, ambiguity, recommended next action on incoming messages            |
| `translation/tone`      | `check_tone`         | Directness/warmth/urgency scoring and flagged phrases                       |
| `translation/outgoing`  | `rewrite_outgoing`   | Register-targeted rewrites that preserve specified terms                    |
| `translation/meetings`  | `brief_meeting`      | Verbatim-anchored partition of a transcript into asks/decisions/ambiguities |
| `translation/neurotype` | `translate_incoming` | Per-neurotype slice (R6): cross-cutting `neurotypes`-tagged examples        |

Each slice is loaded by `neurodock_evals.corpus.load_slice("translation/<name>")`
and run via `neurodock_evals.runner.run_example`.

The `translation/neurotype` slice is **cross-cutting**: every example carries a
`neurotypes` tag (the canonical profile enum) and the harness aggregates a
score per neurotype in addition to the per-tool slices. See
`neurotype/README.md`.
