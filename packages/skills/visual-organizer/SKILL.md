---
name: visual-organizer
version: 0.1.0
description: Converts prose, meeting notes, or overwhelm-dumps into Mermaid diagrams (flowchart / sequence / mindmap).
neurotypes: ["adhd", "audhd", "asd"]
status: stable
triggers:
  - command: "/visualize"
  - command: "/diagram"
  - phrase: "draw this out"
  - phrase: "make a diagram"
mcp_dependencies: []
profile_dependencies:
  - preferences.motion # if "reduced", the diagram MUST have animation: false
license: AGPL-3.0-or-later
---

# visual-organizer

Turns a wall of related ideas into a Mermaid diagram so the user can see structure instead of paragraphs. Pure formatting skill — no MCP calls in v0.1.0.

## Activation

Activate when any of the following holds:

1. The user invokes `/visualize` or `/diagram`.
2. The user says "draw this out" or "make a diagram" (case-insensitive).
3. The user has just pasted a wall of interlinked items (≥ 6 distinct concepts, references between them) and a structural view would help. Use judgement; the prose answer still goes first. Offer the diagram, don't impose it.

The user picked the trigger. Respect it. Do not editorialise their state.

## Pick the diagram type

| Input shape                                       | Diagram                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| Linear cause-and-effect, a process, or a pipeline | `flowchart TD`                                  |
| Interactions between named actors over time       | `sequenceDiagram`                               |
| Loose related concepts the user dumped in one go  | `mindmap`                                       |
| Branching decisions and consequences              | `flowchart LR` with diamond `{decision?}` nodes |

If two fit, pick the one with fewer nodes. Cognitive load cap below is the tie-breaker.

## Generate the Mermaid block

1. Open a fenced ` ```mermaid ` code block. Close it cleanly.
2. Use 2-space indentation throughout.
3. Node IDs: short, no spaces, `camelCase` (e.g. `prRaised`, `staging`, `merge`).
4. Node labels: human-readable inside `[brackets]` (rectangles), `("parens")` (rounded), or `{braces}` (decisions).
5. Edge labels: `-- short label -->`. Keep them under five words.
6. Group with `subgraph name["Label"] ... end` when grouping clarifies; do not over-group.

## Required directives (every diagram)

Put both at the very top of the block, before any other content.

1. `%%{init: {'theme':'neutral'}}%%` — single neutral hue, matches the project palette.
2. If `profile.preferences.motion == "reduced"`, also add `%%{init: {'flowchart': {'animation': false}}}%%`.

The two init blocks can be merged into one when both apply. Either form is acceptable as long as both keys are honoured.

## Cognitive load cap

**Hard cap: 25 nodes per diagram.** If the input has more, split into two diagrams or roll up sub-concepts into a single node and surface the detail in prose underneath. This is the project default — do not exceed it without an explicit user instruction.

## Output structure (every invocation)

In this order, every time:

1. One sentence stating what the diagram represents. No preamble.
2. The fenced Mermaid block.
3. An accessible-description line directly below the block, in the exact format:
   `_Accessible description: <plain-prose summary>_`
   Length: 20–200 characters. Screen-reader users get the same content as sighted users.
4. Optional: 1–3 bullets calling out the most important relationships shown. Only include if they add information the diagram alone doesn't make obvious.

## Do not

- Do not produce a diagram **instead of** a prose answer when the user asked a question. The diagram is a structural view alongside prose, not a replacement.
- Do not editorialise the user's state ("looks like you're overwhelmed!"). Just turn the text into a diagram.
- Do not exceed 25 nodes without an explicit instruction.
- Do not omit the accessible-description line. It is mandatory.
- Do not use colour to convey meaning — the neutral theme is single-hue by design.
- Do not animate. The neutral theme plus `animation: false` (when set) keeps motion out.

# TODO: phase-2 enrichment — when `mcp-cognitive-graph` is available, optionally call `recall_entity` to populate node labels with the user's existing terminology and link concepts to prior decisions.

## Examples

See `tests/01-flowchart-from-prose.md`, `tests/02-sequence-from-meeting-notes.md`, and `tests/03-mindmap-from-overwhelm-dump.md` for full input → output pairs that the CI replays against a reference client.
