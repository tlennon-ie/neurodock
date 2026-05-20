# Test 01 — Flow A: prep a 1:1 with two facts on file

**Scenario:** User says `prep my 1:1 with Sarah`. The cognitive graph has an entity `Sarah` (a person) with two facts on file and one connected project. The skill produces a one-page brief with last-interaction timestamp, two open topics, one recent context entry, and one suggested opener.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-task-fractionator` is available (mocked but unused in this flow).
`mcp-cognitive-graph` IS mocked as available.
`mcp-chronometric` is NOT mocked as available (Flow A does not require it).

Mocked `recall_entity({ "name_or_alias": "Sarah" })` returns:

```json
{
  "entity": {
    "id": "a47c3b21-9d8e-4f5a-b6c7-8d9e0f1a2b3c",
    "type": "person",
    "name": "Sarah",
    "aliases": [],
    "last_interaction_at": "2026-05-12T15:20:00+01:00"
  },
  "facts": [
    {
      "fact_id": "f1a2b3c4-d5e6-4789-90ab-cdef12345678",
      "subject": {
        "type": "person",
        "id": "a47c3b21-9d8e-4f5a-b6c7-8d9e0f1a2b3c"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "blocked on staging-DB access for the migration project; waiting on platform team"
      },
      "recorded_at": "2026-05-12T15:20:00+01:00"
    },
    {
      "fact_id": "f2b3c4d5-e6f7-4890-a1bc-def123456789",
      "subject": {
        "type": "person",
        "id": "a47c3b21-9d8e-4f5a-b6c7-8d9e0f1a2b3c"
      },
      "predicate": "decided_in",
      "object": { "literal": "owns the read-replica failover runbook from Q2" },
      "recorded_at": "2026-05-05T11:00:00+01:00"
    }
  ],
  "neighbours": [
    {
      "entity": {
        "type": "project",
        "id": "p1c2d3e4-f5a6-4789-abcd-ef0123456789",
        "name": "migration-q2"
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

## User prompt

> prep my 1:1 with Sarah

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "Sarah" })` — single call with the parsed name verbatim. Note `resolution.method == "exact"` so no confirmation question is asked.

That is the only tool call in this flow. `decompose`, `record_fact`, and any chronometric tool MUST NOT be called.

## Expected output

```
1:1 prep — Sarah. Last interaction: 2026-05-12T15:20:00+01:00.

### Open topics
- blocked on staging-DB access for the migration project; waiting on platform team (2026-05-12)
- owns the read-replica failover runbook from Q2 (2026-05-05)

### Recent context
- migration-q2 (belongs_to)

Suggested opener: "Where did staging-DB access land — still waiting on platform team?"
This brief is for you, not for sharing. It is not a performance summary.
```

## Pass criteria specific to this test

- Exactly one tool call: `recall_entity` with `name_or_alias == "Sarah"` (verbatim, capitalised as the user typed it).
- No call to `decompose`, `record_fact`, `recall_decisions`, `mark_session_start`, `mark_session_end`, or `get_time_context`.
- The output contains exactly two bullets under `### Open topics` (matching the two facts).
- The literal substring `"blocked on staging-DB access for the migration project; waiting on platform team"` appears in the output — facts are NOT paraphrased.
- The literal substring `"owns the read-replica failover runbook from Q2"` appears in the output.
- The literal substring `"This brief is for you, not for sharing. It is not a performance summary."` appears as the final line.
- The suggested opener is drawn from the most recent open topic (the staging-DB blocker, recorded 2026-05-12), not the older fact.
- No words from the banlist appear in any output: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`, `should have known`, `underperforming`, `let the team down`, `needs to step up`.
- The output never refers to Sarah's performance, productivity, or any rating.
- The output never proposes a meeting agenda the user did not ask for.
- The first sentence (`1:1 prep — Sarah. Last interaction: 2026-05-12T15:20:00+01:00.`) is ≤ 100 characters.
- Universal pass criteria (see `README.md`) all hold.
