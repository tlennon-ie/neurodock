# Test 01 — Flow A: stakeholder map for a feature with proposers, blockers, endorsers

**Scenario:** User says `who cares about the export pipeline`. The cognitive graph has an entity `export-pipeline` (a project) with five facts on file: one proposal, one block, one endorsement, and two pieces of other context. One related person who is not already in a fact bucket. The skill produces a bucketed stakeholder map with verbatim quotes and dates, ending with the mandatory closing line.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-cognitive-graph` IS mocked as available.
`neurodock-task-fractionator` IS mocked as available but unused in this flow.

Mocked `recall_entity({ "name_or_alias": "the export pipeline" })` returns:

```json
{
  "entity": {
    "id": "ent_01HZPRJEXPORT",
    "type": "project",
    "name": "export-pipeline",
    "aliases": ["the export pipeline", "exporter v2"],
    "created_at": "2026-03-14T09:00:00+01:00"
  },
  "facts": [
    {
      "fact_id": "f01a2b3c-d4e5-4f67-8901-234567890abc",
      "subject": {
        "type": "person",
        "id": "ent_01HZPERSPRIYA",
        "name": "Priya"
      },
      "predicate": "proposed",
      "object": {
        "literal": "originally pitched at the Q1 planning offsite as the unlock for the enterprise tier"
      },
      "recorded_at": "2026-03-14T11:00:00+01:00"
    },
    {
      "fact_id": "f02b3c4d-e5f6-4789-9012-34567890bcde",
      "subject": {
        "type": "person",
        "id": "ent_01HZPERSROBERTO",
        "name": "Roberto"
      },
      "predicate": "blocked_by",
      "object": {
        "literal": "blocking on legal review of the data-residency claims for EU customers"
      },
      "recorded_at": "2026-05-08T14:30:00+01:00"
    },
    {
      "fact_id": "f03c4d5e-f6a7-4890-a123-4567890cdef0",
      "subject": {
        "type": "person",
        "id": "ent_01HZPERSALEX",
        "name": "Alex"
      },
      "predicate": "endorsed",
      "object": {
        "literal": "signed off on the technical approach in the architecture review"
      },
      "recorded_at": "2026-04-22T16:00:00+01:00"
    },
    {
      "fact_id": "f04d5e6f-a7b8-4901-b234-567890def012",
      "subject": {
        "type": "project",
        "id": "ent_01HZPRJEXPORT",
        "name": "export-pipeline"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "raised again in the May exec review; no decision taken"
      },
      "recorded_at": "2026-05-12T10:00:00+01:00"
    },
    {
      "fact_id": "f05e6f7a-b8c9-4012-c345-67890ef01234",
      "subject": {
        "type": "project",
        "id": "ent_01HZPRJEXPORT",
        "name": "export-pipeline"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "QA flagged two open bugs from the beta cohort"
      },
      "recorded_at": "2026-05-15T09:15:00+01:00"
    }
  ],
  "related_entities": [
    {
      "id": "ent_01HZPERSPRIYA",
      "type": "person",
      "name": "Priya",
      "co_occurrence_count": 3
    },
    {
      "id": "ent_01HZPERSROBERTO",
      "type": "person",
      "name": "Roberto",
      "co_occurrence_count": 2
    },
    {
      "id": "ent_01HZPERSALEX",
      "type": "person",
      "name": "Alex",
      "co_occurrence_count": 1
    },
    {
      "id": "ent_01HZPERSCATHAL",
      "type": "person",
      "name": "Cathal",
      "co_occurrence_count": 1
    }
  ],
  "resolution": {
    "method": "alias",
    "score": 1.0
  },
  "truncated_facts": false
}
```

Note: the resolution method is `alias` (the user said `the export pipeline`, the canonical name is `export-pipeline`). The skill MUST surface this and ask for confirmation before continuing.

## User prompt

Turn 1:

> who cares about the export pipeline

Turn 2 (confirming the alias resolution):

> yes

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "the export pipeline" })` — single call with the parsed feature reference verbatim. Turn 1.

That is the only tool call in this flow. `recall_decisions`, `decompose`, and `record_fact` MUST NOT be called.

## Expected output

Turn 1 response (the alias-confirmation question):

```
I read "the export pipeline" as the entity "export-pipeline" (alias match, score 1.0). Continue?
```

Turn 2 response (the stakeholder map):

```
Stakeholder map — export-pipeline.

### Proposed by
- Priya: "originally pitched at the Q1 planning offsite as the unlock for the enterprise tier" (2026-03-14)

### Blocked by
- Roberto: "blocking on legal review of the data-residency claims for EU customers" (2026-05-08)

### Endorsed by
- Alex: "signed off on the technical approach in the architecture review" (2026-04-22)

### Recent context
- Cathal (related)

### Other context
- "raised again in the May exec review; no decision taken" (2026-05-12)
- "QA flagged two open bugs from the beta cohort" (2026-05-15)

This map shows the political shape of the feature as the graph remembers it. Stakeholder messiness is the job, not a failure.
```

## Pass criteria specific to this test

**Tool-call correctness:**

- Exactly one tool call: `recall_entity` with `name_or_alias == "the export pipeline"` (verbatim, including the leading "the").
- No call to `recall_decisions`, `decompose`, `record_fact`, `mark_session_start`, `mark_session_end`, or `get_time_context`.

**Alias-resolution correctness:**

- Turn 1 response MUST contain the literal substring `"I read \"the export pipeline\" as the entity \"export-pipeline\" (alias match, score 1.0). Continue?"` — the skill always confirms when `resolution.method != "exact"`.
- The skill does NOT render the stakeholder map until the user confirms in turn 2.

**Bucketing correctness:**

- The fact with predicate `proposed` appears under `### Proposed by`, attributed to Priya.
- The fact with predicate `blocked_by` appears under `### Blocked by`, attributed to Roberto.
- The fact with predicate `endorsed` appears under `### Endorsed by`, attributed to Alex.
- The two `mentioned_in` facts appear under `### Other context`.
- The fourth related_entity (Cathal) appears under `### Recent context` because he is a person not already in a fact bucket. Priya, Roberto, and Alex do NOT reappear in `### Recent context`.

**Verbatim quoting:**

- The literal substring `"originally pitched at the Q1 planning offsite as the unlock for the enterprise tier"` appears in the output — facts are NOT paraphrased.
- The literal substring `"blocking on legal review of the data-residency claims for EU customers"` appears in the output.
- The literal substring `"signed off on the technical approach in the architecture review"` appears in the output.
- The literal substring `"raised again in the May exec review; no decision taken"` appears in the output.
- The literal substring `"QA flagged two open bugs from the beta cohort"` appears in the output.

**Closing line and voice:**

- The literal substring `"This map shows the political shape of the feature as the graph remembers it. Stakeholder messiness is the job, not a failure."` appears as the final line of turn 2.
- No words from the banlist appear in any output: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`, `should have known`, `aligned`, `north star`, `circle back`, `actionable insights`, `underperforming`.
- The output never produces a "trust score", "influence map", or quantification of any stakeholder.
- The output never proposes stakeholder strategy or coaching.
- Universal pass criteria (see `README.md`) all hold.
