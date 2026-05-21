# Test 01 — Flow A: draft a 4-page briefing note in the canonical structure

**Scenario:** User says `draft a briefing note on housing supply, 4 pages`. The skill parses the topic and page budget, computes the canonical section budgets (Background 0.75 / Current position 0.75 / Options 1.25 / Recommendation 0.75 / Risks 0.5, summing to 4.0), calls `decompose` with a 90-minute time budget, and renders a section plan with all five canonical headings in canonical order. The five headings are FIXED — no adjectives, no editorial framing.

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
`neurodock-cognitive-graph` is mocked as available but unused in this flow.
`neurodock-chronometric` is NOT mocked as available (Flow A does not require it).

Mocked `decompose` is called with:

```json
{
  "goal": "Draft a public-service briefing note on: housing supply. Total length: 4 pages. Five sections in canonical order with these page budgets:\n1. Background (0.75 pages)\n2. Current position (0.75 pages)\n3. Options (1.25 pages)\n4. Recommendation (0.75 pages)\n5. Risks (0.50 pages)\nEach section is one atomic write task. Do not editorialise in section headings — the headings are fixed.",
  "time_budget": "PT90M"
}
```

Mocked response:

```json
{
  "tasks": [
    {
      "sequence": 1,
      "title": "Draft Background section",
      "estimated_minutes": 18,
      "acceptance_criteria": [
        "Fits within 0.75 pages. States the historical and demographic context of housing supply without editorial framing."
      ],
      "tags": ["section:background", "write"],
      "dependencies": []
    },
    {
      "sequence": 2,
      "title": "Draft Current position section",
      "estimated_minutes": 18,
      "acceptance_criteria": [
        "Fits within 0.75 pages. States the present supply pipeline, planning approvals, and completions data with cited sources."
      ],
      "tags": ["section:current_position", "write"],
      "dependencies": [1]
    },
    {
      "sequence": 3,
      "title": "Draft Options section",
      "estimated_minutes": 24,
      "acceptance_criteria": [
        "Fits within 1.25 pages. Presents at least three distinct policy options, each with cost/benefit framing, without preferring one."
      ],
      "tags": ["section:options", "write"],
      "dependencies": [2]
    },
    {
      "sequence": 4,
      "title": "Draft Recommendation section",
      "estimated_minutes": 18,
      "acceptance_criteria": [
        "Fits within 0.75 pages. States one preferred option from the Options section, with the reasoning that links to the assessment criteria."
      ],
      "tags": ["section:recommendation", "write"],
      "dependencies": [3]
    },
    {
      "sequence": 5,
      "title": "Draft Risks section",
      "estimated_minutes": 12,
      "acceptance_criteria": [
        "Fits within 0.50 pages. Identifies delivery, political, and fiscal risks of the recommended option, each with mitigation."
      ],
      "tags": ["section:risks", "write"],
      "dependencies": [4]
    }
  ]
}
```

## User prompt

> draft a briefing note on housing supply, 4 pages

## Expected tool calls (in order)

1. `decompose` — exactly one call, with the goal string above and `time_budget: "PT90M"`.

No other tool calls in this flow. `recall_entity`, `record_fact`, `mark_session_start`, and `request_break_if_needed` MUST NOT be called.

## Expected output

```
Briefing note plan — housing supply, 4 pages. 5 atomic write tasks.

### Background (0.75 pages)
- Draft Background section (18 min)
  Acceptance: Fits within 0.75 pages. States the historical and demographic context of housing supply without editorial framing.

### Current position (0.75 pages)
- Draft Current position section (18 min)
  Acceptance: Fits within 0.75 pages. States the present supply pipeline, planning approvals, and completions data with cited sources.

### Options (1.25 pages)
- Draft Options section (24 min)
  Acceptance: Fits within 1.25 pages. Presents at least three distinct policy options, each with cost/benefit framing, without preferring one.

### Recommendation (0.75 pages)
- Draft Recommendation section (18 min)
  Acceptance: Fits within 0.75 pages. States one preferred option from the Options section, with the reasoning that links to the assessment criteria.

### Risks (0.50 pages)
- Draft Risks section (12 min)
  Acceptance: Fits within 0.50 pages. Identifies delivery, political, and fiscal risks of the recommended option, each with mitigation.

Five sections, fixed order, fixed headings. Page budgets sum to 4. The plan is the deliverable — not the draft.
```

## Pass criteria specific to this test

**Structural correctness — the canonical structure (load-bearing):**

- The output contains exactly five `###` headings.
- The five headings appear in this exact order: `### Background (0.75 pages)`, `### Current position (0.75 pages)`, `### Options (1.25 pages)`, `### Recommendation (0.75 pages)`, `### Risks (0.50 pages)`.
- The five heading nouns are EXACTLY `Background`, `Current position`, `Options`, `Recommendation`, `Risks`. No adjectives. The literal substrings `Critical Background`, `Surprising Background`, `Bold Options`, `Innovative Options`, `Strong Recommendation`, `Key Risks`, `Critical Risks`, `Major Risks` MUST NOT appear.
- The page budgets in the headings sum to exactly 4.0 (0.75 + 0.75 + 1.25 + 0.75 + 0.5).
- The first sentence (`Briefing note plan — housing supply, 4 pages. 5 atomic write tasks.`) is ≤ 100 characters.

**Tool-call correctness:**

- Exactly one tool call: `decompose`.
- The `goal` argument to `decompose` contains the five canonical section names in canonical order, each followed by its computed page budget. The `goal` ends with `Each section is one atomic write task. Do not editorialise in section headings — the headings are fixed.`
- The `time_budget` argument is the literal ISO 8601 string `"PT90M"`.
- No call to `recall_entity`, `record_fact`, `mark_session_start`, `mark_session_end`, or `request_break_if_needed`.

**Verbatim discipline:**

- Each task title appears verbatim from the `decompose` response — not paraphrased.
- Each task's first acceptance criterion appears verbatim under `Acceptance:`.
- Estimated minutes appear verbatim (no rounding from `18` to `~20`).

**Voice and banned phrases:**

- The closing line `Five sections, fixed order, fixed headings. Page budgets sum to 4. The plan is the deliverable — not the draft.` appears as the final line.
- The skill does not draft the note itself — the output is the plan, not prose.
- No editorial framing on the topic: the words `housing crisis`, `urgent`, `unprecedented`, `bold`, `courageous` MUST NOT appear in skill-emitted output.
- No words from the puffery banlist: `world-class`, `innovative`, `transformative`, `step-change`, `paradigm shift`, `bold`, `courageous`, `brave` MUST NOT appear.
- No false-balance phrases: `stakeholders need to come together`, `balance must be struck`, `all sides have valid points` MUST NOT appear.
- The skill does not propose follow-up actions (`shall I draft Background first?`, `want me to start on Options?`). Stops after the closing line.
- Universal pass criteria (see `README.md`) all hold.
