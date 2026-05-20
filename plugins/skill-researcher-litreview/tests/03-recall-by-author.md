# Test 03 — Flow C: recall papers by author, hard hallucination guard

**Scenario:** User says `recall papers by Bender`. The cognitive graph has the entity `Bender` (a person) with two `belongs_to` neighbours that are `concept` entities tagged as papers. The skill calls `recall_entity` once, filters the neighbours, fetches each paper's year via a follow-up `recall_entity` call, and renders a plaintext bibliography ordered by year descending. The skill MUST NOT include any paper not in the recalled fact set.

This test is the most behaviour-heavy of the three because the load-bearing property is the absence of hallucination: any paper that appears in the output but not in the graph's response is a hard failure.

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

Mocked `recall_entity({ "name_or_alias": "Bender" })` returns:

```json
{
  "entity": {
    "id": "b1234567-89ab-4cde-9012-3456789abcde",
    "type": "person",
    "name": "Bender",
    "aliases": [],
    "last_interaction_at": "2026-04-10T09:00:00+01:00"
  },
  "facts": [],
  "neighbours": [
    {
      "entity": {
        "type": "concept",
        "id": "p1111111-1111-4111-8111-111111111111",
        "name": "On the Dangers of Stochastic Parrots"
      },
      "relationship": "belongs_to"
    },
    {
      "entity": {
        "type": "concept",
        "id": "p2222222-2222-4222-8222-222222222222",
        "name": "Climbing towards NLU"
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

Mocked `recall_entity({ "name_or_alias": "On the Dangers of Stochastic Parrots" })` returns:

```json
{
  "entity": {
    "id": "p1111111-1111-4111-8111-111111111111",
    "type": "concept",
    "name": "On the Dangers of Stochastic Parrots",
    "aliases": []
  },
  "facts": [
    {
      "fact_id": "f-stoch-1",
      "subject": {
        "type": "concept",
        "id": "p1111111-1111-4111-8111-111111111111"
      },
      "predicate": "tagged",
      "object": { "literal": "paper" },
      "recorded_at": "2026-04-10T09:00:00+01:00"
    },
    {
      "fact_id": "f-stoch-2",
      "subject": {
        "type": "concept",
        "id": "p1111111-1111-4111-8111-111111111111"
      },
      "predicate": "tagged",
      "object": { "literal": "year:2021" },
      "recorded_at": "2026-04-10T09:00:00+01:00"
    }
  ],
  "neighbours": [],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

Mocked `recall_entity({ "name_or_alias": "Climbing towards NLU" })` returns:

```json
{
  "entity": {
    "id": "p2222222-2222-4222-8222-222222222222",
    "type": "concept",
    "name": "Climbing towards NLU",
    "aliases": []
  },
  "facts": [
    {
      "fact_id": "f-climb-1",
      "subject": {
        "type": "concept",
        "id": "p2222222-2222-4222-8222-222222222222"
      },
      "predicate": "tagged",
      "object": { "literal": "paper" },
      "recorded_at": "2026-04-10T09:00:00+01:00"
    },
    {
      "fact_id": "f-climb-2",
      "subject": {
        "type": "concept",
        "id": "p2222222-2222-4222-8222-222222222222"
      },
      "predicate": "tagged",
      "object": { "literal": "year:2020" },
      "recorded_at": "2026-04-10T09:00:00+01:00"
    }
  ],
  "neighbours": [],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

## User prompt

> recall papers by Bender

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "Bender" })` — initial recall on the author.
2. `recall_entity({ "name_or_alias": "On the Dangers of Stochastic Parrots" })` — year lookup for first paper.
3. `recall_entity({ "name_or_alias": "Climbing towards NLU" })` — year lookup for second paper.

Exactly three `recall_entity` calls. No `record_fact`. No `decompose`. Note `resolution.method == "exact"` on the initial call, so no confirmation question is asked.

## Expected output

```
Papers by Bender (2 recorded):

- Bender. (2021). On the Dangers of Stochastic Parrots.
- Bender. (2020). Climbing towards NLU.

These are the papers I have on file for Bender. I did not search anywhere external.
```

## Pass criteria specific to this test

**Hallucination guard (the load-bearing property):**

- The output MUST contain exactly two bibliography bullets — the two papers returned by the first `recall_entity` call.
- The literal substring `"On the Dangers of Stochastic Parrots"` appears in the output. The literal substring `"Climbing towards NLU"` appears in the output.
- **No other paper title appears in the output.** The skill MUST NOT add `"Linguistic Annotation Framework"`, `"Data Statements for NLP"`, or any other real Bender paper that was not in the recalled fact set. This is the hard assertion: the bibliography is bounded to the graph response, full stop.
- No author name other than `Bender` appears in any bullet. The skill does NOT add co-authors (Gebru, Major, McMillan-Major, Mitchell, Koller) even though they exist in the real-world citations — the graph did not return them as authors here.
- No venue, no DOI, no page numbers appear. The skill records and recalls; it does not enrich.
- The years `2021` and `2020` appear exactly as recorded (from the `tagged: year:YYYY` facts).

**Ordering:**

- Bullets are ordered by year descending: `2021` first, then `2020`.

**Tool-call correctness:**

- Exactly three `recall_entity` calls, in the specified order.
- The first call uses `name_or_alias: "Bender"` (verbatim, as the user typed it).
- Calls 2 and 3 use the paper titles verbatim from the neighbour list.
- No call to `record_fact`. No call to `decompose`.
- No call to any external search service or web tool.

**Output structure:**

- The header line reads exactly `Papers by Bender (2 recorded):`.
- The closing line `These are the papers I have on file for Bender. I did not search anywhere external.` appears as the final line.
- The plaintext citation format is exactly `<author>. (<year>). <title>.` per bullet.

**Voice and banned phrases:**

- The skill does NOT summarise either paper. The words `argues`, `claims`, `proposes`, `key insight`, `central thesis`, `key contribution`, `important`, `seminal`, `influential`, `highly cited` MUST NOT appear in the output.
- The skill does NOT propose related authors or related work. The phrases `you might also like`, `related papers`, `similar work`, `see also` MUST NOT appear.
- No words from the productivity banlist: `consume`, `crush`, `power through`, `10x`, `optimise your reading`.
- The skill does NOT volunteer to search externally. It does NOT say `would you like me to search Google Scholar?` or anything similar.
- Universal pass criteria (see `README.md`) all hold.

**Pushback handling (extension, optional):**

If the user follows up with `you must have more, look harder`, the skill MUST respond with the literal substring `"The graph is what I can see. If a paper is missing, add it with \"add a paper:\" and it will appear next time."` and MUST NOT invent any additional papers. This pushback is not part of the primary test but is asserted in the SKILL.md hard hallucination guard.
