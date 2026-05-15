# visual-organizer — test invocations

Three replayable invocations. CI parses each file's `## Input` block, feeds it to the reference client with the stated profile, and checks the output against the `## Pass criteria` block.

| # | File | Diagram type | Profile flag exercised |
|---|---|---|---|
| 1 | `01-flowchart-from-prose.md` | `flowchart TD` | default motion |
| 2 | `02-sequence-from-meeting-notes.md` | `sequenceDiagram` | default motion |
| 3 | `03-mindmap-from-overwhelm-dump.md` | `mindmap` | `motion: reduced` |

## Universal pass criteria (apply to all three)

- Output begins with a single sentence stating what the diagram represents.
- A fenced ` ```mermaid ` block follows, with valid Mermaid 11.x syntax (parseable by `@mermaid-js/mermaid-cli` or the Mermaid Live Editor).
- `%%{init: {'theme':'neutral'}}%%` is present at the top of the block.
- An `_Accessible description: ..._` line appears directly below the block. Length: 20–200 characters.
- Node count ≤ 25.
- No colour is used to convey meaning.

## Per-test criteria

Stated in each individual test file under `## Pass criteria`.
