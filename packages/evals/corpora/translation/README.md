# translation/ slices

Eval corpora for the four `mcp-translation` tools, per ADR 0005 §4
(eval-corpus binding).

| Slice                  | Tool                 | What it tests                                                               |
| ---------------------- | -------------------- | --------------------------------------------------------------------------- |
| `translation/incoming` | `translate_incoming` | Subtext, ambiguity, recommended next action on incoming messages            |
| `translation/tone`     | `check_tone`         | Directness/warmth/urgency scoring and flagged phrases                       |
| `translation/outgoing` | `rewrite_outgoing`   | Register-targeted rewrites that preserve specified terms                    |
| `translation/meetings` | `brief_meeting`      | Verbatim-anchored partition of a transcript into asks/decisions/ambiguities |

Each slice is loaded by `neurodock_evals.corpus.load_slice("translation/<name>")`
and run via `neurodock_evals.runner.run_example`.
