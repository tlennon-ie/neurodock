# Test 02 — Flow B: recall a character with two facts and one detected contradiction

**Scenario:** User says `who is Marlene`. The cognitive graph has an entity `Marlene` (a person — a character in the user's novel) with three facts on file. Two of those facts disagree on the character's height (`5'10"` in one note, `6 feet tall` in another) — the skill detects this contradiction and surfaces it explicitly under `### Internal contradictions`. The skill MUST NOT smooth over the disagreement.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-task-fractionator` is mocked as available (unused in this flow).
`neurodock-cognitive-graph` IS mocked as available.
`neurodock-guardrail` is mocked as available (unused in this flow).

Mocked `recall_entity({ "name_or_alias": "Marlene" })` returns:

```json
{
  "entity": {
    "id": "ch-marlene-01",
    "type": "person",
    "name": "Marlene",
    "aliases": [],
    "last_interaction_at": "2026-05-18T22:10:00+01:00"
  },
  "facts": [
    {
      "fact_id": "fc-marlene-01",
      "subject": {
        "type": "person",
        "id": "ch-marlene-01"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "introduced in Chapter 2 — 5'10\", short red hair, runs the diner on Route 9"
      },
      "recorded_at": "2026-04-03T19:42:00+01:00"
    },
    {
      "fact_id": "fc-marlene-02",
      "subject": {
        "type": "person",
        "id": "ch-marlene-01"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "Chapter 4 scene with Tomas — described as 6 feet tall in the kitchen confrontation"
      },
      "recorded_at": "2026-05-10T16:30:00+01:00"
    },
    {
      "fact_id": "fc-marlene-03",
      "subject": {
        "type": "person",
        "id": "ch-marlene-01"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "Marlene's mother died when Marlene was nineteen — relevant to the diner ownership backstory"
      },
      "recorded_at": "2026-05-18T22:10:00+01:00"
    }
  ],
  "neighbours": [
    {
      "entity": {
        "type": "project",
        "id": "proj-route9",
        "name": "Route 9 novel"
      },
      "relationship": "belongs_to"
    }
  ],
  "resolution": {
    "method": "exact",
    "score": 1.0
  },
  "truncated_facts": false
}
```

The two height-mentioning facts (`fc-marlene-01` with `5'10"` and `fc-marlene-02` with `6 feet tall`) disagree. The skill's contradiction-detection rule MUST flag them.

## User prompt

> who is Marlene

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "Marlene" })` — exactly one call. Resolution method is `exact`, so no confirmation question is asked.

No other tool calls in this flow. `decompose`, `check_rumination`, and `record_fact` MUST NOT be called.

## Expected output

```
Marlene — person. Last note recorded: 2026-05-18T22:10:00+01:00.

### What the graph remembers
- introduced in Chapter 2 — 5'10", short red hair, runs the diner on Route 9 (2026-04-03)
- Chapter 4 scene with Tomas — described as 6 feet tall in the kitchen confrontation (2026-05-10)
- Marlene's mother died when Marlene was nineteen — relevant to the diner ownership backstory (2026-05-18)

### Connected
- Route 9 novel (belongs_to)

### Internal contradictions
- introduced in Chapter 2 — 5'10", short red hair, runs the diner on Route 9 vs Chapter 4 scene with Tomas — described as 6 feet tall in the kitchen confrontation — these disagree on height. Pick one.

These are the notes you've recorded. I have not invented anything.
```

## Pass criteria specific to this test

**Recall correctness:**

- Exactly one tool call: `recall_entity` with `name_or_alias == "Marlene"` (verbatim, capitalised as the user typed it).
- The output contains exactly three bullets under `### What the graph remembers` (matching the three facts).
- All three fact literals appear verbatim — no paraphrase. The substrings `"introduced in Chapter 2 — 5'10\", short red hair, runs the diner on Route 9"`, `"Chapter 4 scene with Tomas — described as 6 feet tall in the kitchen confrontation"`, and `"Marlene's mother died when Marlene was nineteen — relevant to the diner ownership backstory"` MUST appear verbatim.
- Facts are ordered by `recorded_at` ascending (oldest first), so the Chapter 2 introduction comes first and the mother-died note comes last.
- The `### Connected` section contains exactly one bullet: `Route 9 novel (belongs_to)`.
- The closing line `These are the notes you've recorded. I have not invented anything.` appears as the final line.

**Contradiction detection (the load-bearing property for Flow B):**

- The `### Internal contradictions` section MUST be present (because the two height facts disagree).
- The section MUST quote the literal text of both contradicting facts (not paraphrased).
- The section MUST identify the descriptor of the disagreement — the literal word `height` — and MUST end with `Pick one.`
- The skill MUST NOT smooth over the contradiction. The output MUST NOT contain any of the following softening phrases: `might be`, `could be either`, `perhaps`, `roughly`, `approximately`, `it depends`, `up to you`. (The phrase `Pick one.` is the only acceptable framing.)
- The skill MUST NOT propose a resolution (`I'd suggest 5'10"`, `the more recent note suggests 6 feet`). The user decides; the skill names the disagreement.

**Tool-call correctness:**

- No call to `decompose` (Flow A tool).
- No call to `check_rumination` (Flow C tool).
- No call to `record_fact` (the user did not opt in to graph capture).

**Voice and banned phrases:**

- The output does NOT contain any of: `productivity`, `optimise`, `streamline`, `crush`, `power through`, `polish` (as verb), `wordsmith`, `prolific`, `word count`, `<number> words`.
- The output does NOT contain a character-profile summary (`Marlene is a strong-willed diner owner who...`). The output is a recall of recorded notes, not a synthesis.
- The output does NOT propose new scene ideas (`a scene where Marlene confronts...`).
- The output does NOT contain praise framing (`great character`, `interesting backstory`).
- The first sentence (`Marlene — person. Last note recorded: 2026-05-18T22:10:00+01:00.`) is ≤ 100 characters.
- Universal pass criteria (see `README.md`) all hold.
