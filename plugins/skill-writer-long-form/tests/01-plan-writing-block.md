# Test 01 — Flow A: plan a 3-hour writing block

**Scenario:** User says `plan today's writing block, 3 hours`. No project context is mentioned. The skill calls `decompose` with a 3-hour (180-minute) time budget, receives back scene/section-shaped atomic tasks (no word-count goals), and renders the task list with the mandatory closing line.

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
`neurodock-guardrail` is mocked as available but unused in this flow.

Mocked `decompose` is called with:

```json
{
  "goal": "Writing block planning for: the user's current long-form work in progress. Time budget: 3 hours. Break this into scene-shaped or section-shaped atomic tasks — for example \"draft scene 3: kitchen confrontation\", \"outline the counter-argument in section 4\", \"revise the opening paragraph of chapter 2 for voice\". Each task should be a concrete, finite piece of writing or a discrete revision pass. Do NOT generate word-count goals (e.g. \"write 500 words\"). Do NOT invent scene titles, character names, plot points, or section headings; if specifics are missing, generate generic shaped tasks (\"draft the next scene\", \"revise the previous section\") instead.",
  "time_budget": "PT180M"
}
```

Mocked response:

```json
{
  "tasks": [
    {
      "sequence": 1,
      "title": "Draft the next scene from the working outline",
      "estimated_minutes": 75,
      "acceptance_criteria": [
        "A first-draft scene exists in the manuscript file at the planned insertion point, beginning to end, with at least the load-bearing beats present."
      ],
      "tags": ["drafting"],
      "dependencies": []
    },
    {
      "sequence": 2,
      "title": "Revise the previous scene for voice consistency",
      "estimated_minutes": 45,
      "acceptance_criteria": [
        "Read the scene out loud start to finish; rewrite any sentence whose voice drifts from the established narrator/POV."
      ],
      "tags": ["revision"],
      "dependencies": []
    },
    {
      "sequence": 3,
      "title": "Outline the next two scenes in note form",
      "estimated_minutes": 30,
      "acceptance_criteria": [
        "A note for each upcoming scene captures the load-bearing beat, the POV, and the location — enough to start drafting cold next session."
      ],
      "tags": ["outlining"],
      "dependencies": []
    },
    {
      "sequence": 4,
      "title": "Capture loose-end notes for later",
      "estimated_minutes": 30,
      "acceptance_criteria": [
        "Open threads (character inconsistencies, research gaps, plot threads) are recorded somewhere persistent so they can be picked up in the next session."
      ],
      "tags": ["notes"],
      "dependencies": []
    }
  ]
}
```

Note: 75 + 45 + 30 + 30 = 180 minutes, exactly matching the budget. No discrepancy line should appear.

## User prompt

> plan today's writing block, 3 hours

## Expected tool calls (in order)

1. `decompose({ "goal": "<the writing-shaped goal string above, verbatim>", "time_budget": "PT180M" })` — exactly one call.

No other tool calls in this flow. `recall_entity`, `record_fact`, and `check_rumination` MUST NOT be called.

## Expected output

```
Writing block — 3 hours. 4 atomic tasks.

### Tasks
- Draft the next scene from the working outline (75 min)
  Acceptance: A first-draft scene exists in the manuscript file at the planned insertion point, beginning to end, with at least the load-bearing beats present.
- Revise the previous scene for voice consistency (45 min)
  Acceptance: Read the scene out loud start to finish; rewrite any sentence whose voice drifts from the established narrator/POV.
- Outline the next two scenes in note form (30 min)
  Acceptance: A note for each upcoming scene captures the load-bearing beat, the POV, and the location — enough to start drafting cold next session.
- Capture loose-end notes for later (30 min)
  Acceptance: Open threads (character inconsistencies, research gaps, plot threads) are recorded somewhere persistent so they can be picked up in the next session.

These tasks are shaped to the time you have. Word counts are not in the plan, on purpose.
```

## Pass criteria specific to this test

- Exactly one tool call: `decompose`.
- The `time_budget` argument is the literal ISO 8601 string `"PT180M"` (3 hours × 60).
- The `goal` argument contains the literal substring `"Time budget: 3 hours"` AND the literal substring `"Do NOT generate word-count goals"`. The skill's writing-shaped goal prompt is what makes `decompose` emit scene-shaped tasks rather than word counts; if this string is paraphrased the test fails.
- No call to `recall_entity` (Flow B tool).
- No call to `check_rumination` (Flow C tool).
- No call to `record_fact`.
- The header line states `4 atomic tasks.` (the integer count).
- Each task title appears verbatim from the `decompose` response — not paraphrased.
- Each task's first acceptance criterion appears verbatim under `Acceptance:`.
- Estimated minutes appear verbatim (no rounding from `45` to `~45`, no restating).
- The closing line `These tasks are shaped to the time you have. Word counts are not in the plan, on purpose.` appears as the final line.
- The output does NOT contain any of the following substrings (anti-word-count, anti-productivity):
  - `words per`
  - `word count` / `wordcount`
  - `500 words` / `1000 words` / any `<number> words` pattern
  - `per hour` / `/hour`
  - `productivity`
  - `optimise` / `optimize`
  - `streamline`
  - `crush`
  - `power through`
  - `prolific`
  - `wordsmith`
  - `polish` (as a verb in skill output)
- The output does NOT contain `flow state` framed as praise (the phrase as a noun is fine; "you'll be in flow state" or "achieve flow state" is forbidden).
- The output does NOT contain a "stretch task" or "bonus task" or any framing that suggests the user should aim higher than the budget.
- The skill does NOT propose follow-up actions (`shall I add a stretch goal?`, `want me to track your progress?`). Stops after the closing line.
- The first sentence (`Writing block — 3 hours. 4 atomic tasks.`) is ≤ 100 characters.
- Universal pass criteria (see `README.md`) all hold.
