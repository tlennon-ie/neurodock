# Test 01 — Flow A: start a lit review on embodied cognition in HCI

**Scenario:** User says `start a lit review on embodied cognition in HCI`. The skill calls `decompose` once with a 10-day default budget and a structured goal prompt that asks for atomic reading and synthesis tasks. It groups the returned tasks into a `### Reading` and `### Synthesis` section. It does NOT propose seed papers or name authors.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-task-fractionator` IS mocked as available.
`neurodock-cognitive-graph` IS mocked as available (but unused in this flow).

Mocked `decompose` is called with:

```json
{
  "goal": "Literature review on: embodied cognition in HCI. Break this into atomic reading and synthesis tasks. Include tasks for identifying seed papers, reading in batches, extracting claims, mapping disagreements between sources, and synthesising themes. Do not invent paper titles or author names.",
  "time_budget": "P10D"
}
```

Mocked response:

```json
{
  "tasks": [
    {
      "sequence": 1,
      "title": "Identify 3 seed papers for embodied cognition in HCI",
      "estimated_minutes": 45,
      "acceptance_criteria": [
        "Three candidate seed papers are recorded by hand (title, authors, year). Source can be Google Scholar, a known review, or an advisor recommendation. Papers are recorded via 'add a paper:' so they enter the graph."
      ],
      "tags": ["reading", "seed-selection"],
      "dependencies": []
    },
    {
      "sequence": 2,
      "title": "Read first batch (seed papers 1–3) — close reading",
      "estimated_minutes": 240,
      "acceptance_criteria": [
        "Each seed paper has been read end-to-end. For each, a one-paragraph note exists capturing: the central claim, the method, and one disagreement or open question."
      ],
      "tags": ["reading"],
      "dependencies": [1]
    },
    {
      "sequence": 3,
      "title": "Extract a claims list from the first batch",
      "estimated_minutes": 60,
      "acceptance_criteria": [
        "A flat list of distinct claims is recorded, each annotated with the paper(s) that make it. Identical claims across papers collapse to one entry with multiple citations."
      ],
      "tags": ["synthesis"],
      "dependencies": [2]
    },
    {
      "sequence": 4,
      "title": "Snowball — find 5 papers cited by or citing the seeds",
      "estimated_minutes": 90,
      "acceptance_criteria": [
        "Five additional candidate papers are recorded via 'add a paper:'. Source citation is captured for each (which seed paper led you to it)."
      ],
      "tags": ["reading", "snowball"],
      "dependencies": [3]
    },
    {
      "sequence": 5,
      "title": "Read second batch (snowballed papers) — targeted reading",
      "estimated_minutes": 240,
      "acceptance_criteria": [
        "Each snowballed paper has been read in the section relevant to its connection to a seed. A note exists for each capturing whether it confirms, extends, or contradicts the seed's claim."
      ],
      "tags": ["reading"],
      "dependencies": [4]
    },
    {
      "sequence": 6,
      "title": "Map disagreements across all 8 papers",
      "estimated_minutes": 90,
      "acceptance_criteria": [
        "A two-column note exists: for each disagreement, the two (or more) positions are stated in one sentence each, with the papers supporting each position cited."
      ],
      "tags": ["synthesis", "mapping"],
      "dependencies": [5]
    },
    {
      "sequence": 7,
      "title": "Synthesise themes — first draft",
      "estimated_minutes": 180,
      "acceptance_criteria": [
        "A draft exists naming 3–5 themes that emerge from the 8 papers. Each theme has a one-sentence statement, the papers contributing to it, and one tension or open question."
      ],
      "tags": ["synthesis"],
      "dependencies": [6]
    }
  ]
}
```

Note: tasks 1, 2, 4, 5 are tagged `reading`. Tasks 3, 6, 7 are tagged `synthesis`.

## User prompt

> start a lit review on embodied cognition in HCI

## Expected tool calls (in order)

1. `decompose` with the goal and time budget shown above — exactly one call.

No other tool calls in this flow. `record_fact` and `recall_entity` MUST NOT be called.

## Expected output

```
Lit-review plan — embodied cognition in HCI. 7 atomic tasks across reading and synthesis.

### Reading
- Identify 3 seed papers for embodied cognition in HCI (45 min)
  Acceptance: Three candidate seed papers are recorded by hand (title, authors, year). Source can be Google Scholar, a known review, or an advisor recommendation. Papers are recorded via 'add a paper:' so they enter the graph.
- Read first batch (seed papers 1–3) — close reading (240 min)
  Acceptance: Each seed paper has been read end-to-end. For each, a one-paragraph note exists capturing: the central claim, the method, and one disagreement or open question.
- Snowball — find 5 papers cited by or citing the seeds (90 min)
  Acceptance: Five additional candidate papers are recorded via 'add a paper:'. Source citation is captured for each (which seed paper led you to it).
- Read second batch (snowballed papers) — targeted reading (240 min)
  Acceptance: Each snowballed paper has been read in the section relevant to its connection to a seed. A note exists for each capturing whether it confirms, extends, or contradicts the seed's claim.

### Synthesis
- Extract a claims list from the first batch (60 min)
  Acceptance: A flat list of distinct claims is recorded, each annotated with the paper(s) that make it. Identical claims across papers collapse to one entry with multiple citations.
- Map disagreements across all 8 papers (90 min)
  Acceptance: A two-column note exists: for each disagreement, the two (or more) positions are stated in one sentence each, with the papers supporting each position cited.
- Synthesise themes — first draft (180 min)
  Acceptance: A draft exists naming 3–5 themes that emerge from the 8 papers. Each theme has a one-sentence statement, the papers contributing to it, and one tension or open question.

These tasks scaffold your review. I did not pick seed papers or name authors — that's the first task.
```

## Pass criteria specific to this test

- Exactly one tool call: `decompose`.
- The `goal` argument is the structured literature-review prompt with `embodied cognition in HCI` inserted verbatim — no normalisation (`HCI` stays uppercase).
- The `time_budget` argument is the literal ISO 8601 string `"P10D"`.
- The output contains exactly two sections in order: `### Reading` then `### Synthesis`.
- The Reading section contains exactly the four tasks tagged `reading` (sequences 1, 2, 4, 5), in source order.
- The Synthesis section contains exactly the three tasks tagged `synthesis` (sequences 3, 6, 7), in source order.
- Each task title and estimated minutes appears verbatim from the `decompose` response.
- Each task's first acceptance criterion appears verbatim under `Acceptance:`.
- The closing line `These tasks scaffold your review. I did not pick seed papers or name authors — that's the first task.` appears as the final line.
- **No paper titles or author names appear anywhere in skill output.** The skill must not invent "Dourish 2001" or "Klemmer et al. 2006" or any other paper. The closest the output comes to naming papers is the user-driven phrase "seed papers" — no concrete citations.
- No call to `record_fact` (the skill does not auto-record the topic).
- No call to `recall_entity`.
- No words from the banlist: `consume`, `crush`, `power through`, `10x`, `optimise your reading`, `read more papers per week`.
- No editorialisation about the topic. Phrases like `rich literature`, `active area`, `well-studied`, `foundational work`, `seminal contributions` MUST NOT appear.
- The first sentence (`Lit-review plan — embodied cognition in HCI. 7 atomic tasks across reading and synthesis.`) is ≤ 100 characters.
- The skill does not propose follow-up actions (`shall I record these as a project?`, `want me to suggest seed papers?`). Stops after the closing line.
- Universal pass criteria (see `README.md`) all hold.
