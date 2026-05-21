# Test 01 — Flow A: matter brief on a populated matter

**Scenario:** User says `matter brief: Acme Corp v Beta Holdings`. The cognitive graph has a project entity for the matter with four facts (one deadline, one opposing-counsel note, one filing, one outstanding task) and one connected neighbour. The skill produces a structured brief with the sections in the canonical order. Today's date for the purpose of days-remaining is `2026-05-21`.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
```

`neurodock-cognitive-graph` IS mocked as available.
`mcp-translation` and `translation-legal` are NOT used in this flow.

Today (test fixture date): `2026-05-21`.

Mocked `recall_entity({ "name_or_alias": "Acme Corp v Beta Holdings" })` returns:

```json
{
  "entity": {
    "id": "p9a8b7c6-d5e4-4321-fedc-ba9876543210",
    "type": "project",
    "name": "Acme Corp v Beta Holdings",
    "aliases": ["Acme v Beta"],
    "last_interaction_at": "2026-05-18T16:45:00+01:00"
  },
  "facts": [
    {
      "fact_id": "f1111111-2222-4333-8444-555555555555",
      "subject": {
        "type": "project",
        "id": "p9a8b7c6-d5e4-4321-fedc-ba9876543210"
      },
      "predicate": "tagged",
      "object": {
        "literal": "deadline:2026-06-15: reply brief to opposing counsel's MTD"
      },
      "recorded_at": "2026-05-10T09:30:00+01:00"
    },
    {
      "fact_id": "f2222222-3333-4444-8555-666666666666",
      "subject": {
        "type": "project",
        "id": "p9a8b7c6-d5e4-4321-fedc-ba9876543210"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "opposing counsel: Smith & Jones LLP — lead: J. Smith"
      },
      "recorded_at": "2026-05-05T14:00:00+01:00"
    },
    {
      "fact_id": "f3333333-4444-4555-8666-777777777777",
      "subject": {
        "type": "project",
        "id": "p9a8b7c6-d5e4-4321-fedc-ba9876543210"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "filed:2026-05-18: reply to MTD lodged with the court"
      },
      "recorded_at": "2026-05-18T16:45:00+01:00"
    },
    {
      "fact_id": "f4444444-5555-4666-8777-888888888888",
      "subject": {
        "type": "project",
        "id": "p9a8b7c6-d5e4-4321-fedc-ba9876543210"
      },
      "predicate": "blocked_by",
      "object": {
        "literal": "awaiting client sign-off on the witness statement before service"
      },
      "recorded_at": "2026-05-16T11:00:00+01:00"
    }
  ],
  "neighbours": [
    {
      "entity": {
        "type": "person",
        "id": "x1a2b3c4-d5e6-4789-90ab-cdef12345678",
        "name": "J. Smith"
      },
      "relationship": "mentioned_in"
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

> matter brief: Acme Corp v Beta Holdings

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "Acme Corp v Beta Holdings" })` — single call with the parsed matter name verbatim. Note `resolution.method == "exact"` so no confirmation question is asked.

That is the only tool call in this flow. `record_fact`, `recall_decisions`, and any `mcp-translation` tool MUST NOT be called.

## Expected output

```
Matter brief — Acme Corp v Beta Holdings. Last activity: 2026-05-18T16:45:00+01:00.

### Deadlines
- 2026-06-15 — reply brief to opposing counsel's MTD — 25 days remaining

### Opposing counsel
- opposing counsel: Smith & Jones LLP — lead: J. Smith

### Latest filing
- filed:2026-05-18: reply to MTD lodged with the court (2026-05-18)

### Outstanding
- awaiting client sign-off on the witness statement before service

### Connected
- J. Smith (mentioned_in)
```

## Pass criteria specific to this test

- Exactly one tool call: `recall_entity` with `name_or_alias == "Acme Corp v Beta Holdings"` (verbatim, capitalised as the user typed it, including spaces and the `v`).
- No call to `record_fact`, `recall_decisions`, or any `mcp-translation` tool.
- The header line states `Matter brief — Acme Corp v Beta Holdings. Last activity: 2026-05-18T16:45:00+01:00.` and is ≤ 120 characters.
- Sections appear in this exact order: `### Deadlines`, `### Opposing counsel`, `### Latest filing`, `### Outstanding`, `### Connected`. No other sections appear.
- The deadline line includes the ISO date `2026-06-15`, the description `reply brief to opposing counsel's MTD` verbatim, and the days-remaining computation `25 days remaining` (against fixture date 2026-05-21).
- The literal substring `"opposing counsel: Smith & Jones LLP — lead: J. Smith"` appears in the output — facts are NOT paraphrased.
- The literal substring `"filed:2026-05-18: reply to MTD lodged with the court"` appears in the output.
- The literal substring `"awaiting client sign-off on the witness statement before service"` appears in the output.
- The output does NOT contain any of these words as skill-generated commentary: `should`, `must`, `obligated`, `liable`, `entitled`, `actionable`, `merits`. (These words appearing inside verbatim user-recorded facts would be permitted, but this test's fixture contains none of them.)
- The output does NOT contain `advice`, `recommend`, `suggest you`, or any sentence framing the brief as advice.
- The output does NOT propose a reply, a draft, or any strategic action.
- The output does NOT include a closing exhortation (no "let me know if you need more", no "anything else?").
- Universal pass criteria (see `README.md`) all hold.
