# Test 01 — Flow A: prep a code review on a PR with two prior reviewer comments

**Scenario:** User says `prep my code review on PR #482`. The cognitive graph has an entity `PR #482` (a concept) with two facts on file — both prior reviewer comments — and one prior decision linked via a third fact. The skill produces a one-page brief surfacing the two comments and the one decision, verbatim, with no invented commentary.

The load-bearing property of this test: every line in the rendered "Prior reviewer comments" section corresponds 1:1 with a `mentioned_in` or `blocked_by` fact returned by `recall_entity`. No paraphrase, no invention.

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
`neurodock-task-fractionator` is mocked as available but unused in this flow.
`neurodock-chronometric` is NOT mocked as available (Flow A does not use it).

Mocked `recall_entity({ "name_or_alias": "PR #482" })` returns:

```json
{
  "entity": {
    "id": "c91d4e72-1b8a-4c5f-9d0e-2a3b4c5d6e7f",
    "type": "concept",
    "name": "PR #482",
    "aliases": [],
    "last_interaction_at": "2026-05-19T14:10:00+01:00"
  },
  "facts": [
    {
      "fact_id": "f1aa11bb-22cc-4dd1-8eef-1234567890ab",
      "subject": {
        "type": "concept",
        "id": "c91d4e72-1b8a-4c5f-9d0e-2a3b4c5d6e7f"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "the session-token rotation in auth/session.ts looks racy under concurrent refresh — see comment thread"
      },
      "recorded_at": "2026-05-19T14:10:00+01:00"
    },
    {
      "fact_id": "f2bb22cc-33dd-4ee2-9ffa-234567890abc",
      "subject": {
        "type": "concept",
        "id": "c91d4e72-1b8a-4c5f-9d0e-2a3b4c5d6e7f"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "the new test in test_session.py doesn't actually exercise the race path; we discussed adding a deterministic stub"
      },
      "recorded_at": "2026-05-18T11:30:00+01:00"
    },
    {
      "fact_id": "f3cc33dd-44ee-4ff3-aaab-34567890abcd",
      "subject": {
        "type": "concept",
        "id": "c91d4e72-1b8a-4c5f-9d0e-2a3b4c5d6e7f"
      },
      "predicate": "decided_in",
      "object": {
        "literal": "we will use a monotonic version counter, not a wall-clock timestamp, for token freshness checks"
      },
      "recorded_at": "2026-05-17T16:45:00+01:00"
    }
  ],
  "neighbours": [
    {
      "entity": {
        "type": "decision",
        "id": "d4dd44ee-55ff-4aa4-bbcc-4567890abcde",
        "name": "monotonic-token-versioning"
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

> prep my code review on PR #482

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "PR #482" })` — single call with the parsed target verbatim. The `#` is preserved, the space before `#` is preserved, no normalisation. Note `resolution.method == "exact"` so no confirmation question is asked.

That is the only tool call in this flow. `decompose`, `record_fact`, `weekly_rollup`, `recall_decisions`, and any chronometric tool MUST NOT be called.

## Expected output

```
Review prep — PR #482. 2 prior comments, 1 prior decisions on file.

### Prior reviewer comments
- the session-token rotation in auth/session.ts looks racy under concurrent refresh — see comment thread (2026-05-19)
- the new test in test_session.py doesn't actually exercise the race path; we discussed adding a deterministic stub (2026-05-18)

### Prior decisions
- we will use a monotonic version counter, not a wall-clock timestamp, for token freshness checks (2026-05-17)

### What to focus on
the session-token rotation in auth/session.ts looks racy under concurrent refresh — see comment thread

This brief is bounded to what the graph remembers. I did not read the diff.
```

## Pass criteria specific to this test

**Verbatim-rendering (the load-bearing property):**

- Exactly one tool call: `recall_entity` with `name_or_alias == "PR #482"` (verbatim — the `#` is preserved, the space before `#` is preserved).
- No call to `decompose`, `record_fact`, `weekly_rollup`, `recall_decisions`, `mark_session_start`, `mark_session_end`, or `get_time_context`.
- The literal substring `"the session-token rotation in auth/session.ts looks racy under concurrent refresh — see comment thread"` appears in the output exactly once — facts are NOT paraphrased.
- The literal substring `"the new test in test_session.py doesn't actually exercise the race path; we discussed adding a deterministic stub"` appears in the output exactly once.
- The literal substring `"we will use a monotonic version counter, not a wall-clock timestamp, for token freshness checks"` appears in the output exactly once.
- The output contains exactly two bullets under `### Prior reviewer comments` (matching the two `mentioned_in` facts).
- The output contains exactly one bullet under `### Prior decisions` (matching the one `decided_in` fact).
- The `### What to focus on` line is drawn from the most recent prior comment (the staging session-token race, recorded 2026-05-19), not the older comment.

**No-invention:**

- The output does not mention any reviewer name, comment, or decision that is not in the mocked `recall_entity` response.
- The output does not describe the diff, the code, or any specific code change beyond what the facts say.
- The output does not propose what to look at in the code beyond the verbatim "What to focus on" line.

**Structural correctness:**

- The first sentence (`Review prep — PR #482. 2 prior comments, 1 prior decisions on file.`) is ≤ 100 characters.
- The literal substring `"This brief is bounded to what the graph remembers. I did not read the diff."` appears as the final line.
- The header counts (`2 prior comments`, `1 prior decisions`) match the actual fact counts.

**Voice and banned phrases:**

- No words from the banlist appear in any output: `10x`, `ship faster`, `crush it`, `power through`, `grind`, `hustle`, `rockstar`, `ninja`, `synergy`, `growth mindset`, `stretch goal`, `should have known`.
- No praise or sympathy theatre: `nice work`, `great work`, `solid PR`, `looks good to me`, `LGTM`, `nice job` MUST NOT appear.
- No clinical framing: the words `ADHD`, `ASD`, `executive function` MUST NOT appear.
- Universal pass criteria (see `README.md`) all hold.
