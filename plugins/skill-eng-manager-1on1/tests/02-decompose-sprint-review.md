# Test 02 — Flow B: decompose unstructured sprint-review notes

**Scenario:** User says `decompose this sprint review` and pastes a paragraph of unstructured notes from a 60-minute sprint review. The skill calls `decompose` with a 45-minute default time budget and groups the returned atomic tasks by the owner tags the task-fractionator emits. Two named owners plus one unassigned task.

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
`mcp-cognitive-graph` is mocked as available but unused in this flow.

Mocked `decompose` is called with:
```json
{
  "goal": "Sprint review notes — payments squad, sprint 47. Stripe webhook retries are still timing out on the production read path; we agreed Alex would look at the connection-pool sizing. Refund flow has two open bugs from QA, both assigned to Priya: the partial-refund total doesn't round correctly, and the refund confirmation email is going to the wrong address when the customer updated their account email mid-flow. We also need to write a one-pager on the upcoming SCA changes so the rest of engineering knows what's coming, but nobody picked it up.",
  "time_budget": "PT45M"
}
```

Mocked response:
```json
{
  "tasks": [
    {
      "sequence": 1,
      "title": "Reproduce Stripe webhook timeout under production-like load",
      "estimated_minutes": 45,
      "acceptance_criteria": [
        "A failing test (or reproducible curl loop) demonstrates the timeout against a staging environment with prod-equivalent connection-pool config."
      ],
      "tags": ["owner:alex", "area:webhooks", "investigation"],
      "dependencies": []
    },
    {
      "sequence": 2,
      "title": "Tune connection-pool sizing for the read path",
      "estimated_minutes": 30,
      "acceptance_criteria": [
        "Connection pool config is updated, the failing test from sequence 1 passes, and the rationale is captured in the runbook."
      ],
      "tags": ["owner:alex", "area:webhooks", "fix"],
      "dependencies": [1]
    },
    {
      "sequence": 3,
      "title": "Fix partial-refund rounding error",
      "estimated_minutes": 60,
      "acceptance_criteria": [
        "Unit test covers the rounding edge case from QA's report.",
        "Manual verification that the totals in the admin UI match the Stripe refund amount."
      ],
      "tags": ["owner:priya", "area:refunds", "bug"],
      "dependencies": []
    },
    {
      "sequence": 4,
      "title": "Route refund confirmation emails to the current account email",
      "estimated_minutes": 45,
      "acceptance_criteria": [
        "Confirmation email lookup uses the account-current email at send-time, not the snapshot at refund-initiation time.",
        "Regression test reproduces QA's mid-flow email-change scenario."
      ],
      "tags": ["owner:priya", "area:refunds", "bug"],
      "dependencies": []
    },
    {
      "sequence": 5,
      "title": "Draft SCA changes one-pager for engineering",
      "estimated_minutes": 60,
      "acceptance_criteria": [
        "One page or less, covers the timeline, the user-visible impact, and the squad-by-squad action list."
      ],
      "tags": ["area:comms", "docs"],
      "dependencies": []
    }
  ]
}
```

Note: task 5 has no `owner:*` tag, so it belongs in `Unassigned`. Tasks 1+2 are owned by Alex. Tasks 3+4 are owned by Priya.

## User prompt

Turn 1:

> decompose this sprint review

Turn 2 (after the skill asks for the notes):

> Sprint review notes — payments squad, sprint 47. Stripe webhook retries are still timing out on the production read path; we agreed Alex would look at the connection-pool sizing. Refund flow has two open bugs from QA, both assigned to Priya: the partial-refund total doesn't round correctly, and the refund confirmation email is going to the wrong address when the customer updated their account email mid-flow. We also need to write a one-pager on the upcoming SCA changes so the rest of engineering knows what's coming, but nobody picked it up.

## Expected tool calls (in order)

1. `decompose({ "goal": "<the pasted notes, verbatim>", "time_budget": "PT45M" })` — exactly one call. Turn 2.

No other tool calls in this flow. `recall_entity`, `record_fact`, and any chronometric tool MUST NOT be called.

## Expected output

Turn 1 response:

```
Paste the notes. I'll group atomic action items by owner.
```

Turn 2 response:

```
Sprint-review decomposition — 5 atomic items, 3 owners.

### alex
- Reproduce Stripe webhook timeout under production-like load (45 min)
  Acceptance: A failing test (or reproducible curl loop) demonstrates the timeout against a staging environment with prod-equivalent connection-pool config.
- Tune connection-pool sizing for the read path (30 min)
  Acceptance: Connection pool config is updated, the failing test from sequence 1 passes, and the rationale is captured in the runbook.

### priya
- Fix partial-refund rounding error (60 min)
  Acceptance: Unit test covers the rounding edge case from QA's report.
- Route refund confirmation emails to the current account email (45 min)
  Acceptance: Confirmation email lookup uses the account-current email at send-time, not the snapshot at refund-initiation time.

### Unassigned
- Draft SCA changes one-pager for engineering (60 min)
  Acceptance: One page or less, covers the timeline, the user-visible impact, and the squad-by-squad action list.

These items are decomposed from your notes. I did not invent owners or estimates.
```

## Pass criteria specific to this test

- Exactly one tool call: `decompose`, called in turn 2.
- The `goal` argument to `decompose` is the pasted notes verbatim. No paraphrasing, no truncation.
- The `time_budget` argument to `decompose` is the literal ISO 8601 string `"PT45M"`.
- Turn 1 response is exactly one sentence asking for the notes. No editorial framing.
- Turn 2 response contains three sections in order: `### alex`, `### priya`, `### Unassigned`.
- Each task title appears verbatim from the `decompose` response — not paraphrased.
- Each task's first acceptance criterion appears verbatim under `Acceptance:`.
- Estimated minutes appear verbatim (no rounding from `45` to `~45`, no restating).
- The closing line `These items are decomposed from your notes. I did not invent owners or estimates.` appears as the final line of turn 2.
- The header line states `5 atomic items, 3 owners.` — counting `alex`, `priya`, AND `Unassigned` as the three groupings.
- No call to `record_fact` (the user did not opt in to graph capture).
- No call to `mark_session_start` (Flow B does not session-mark).
- No words from the banlist appear in any output: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`, `should have known`, `underperforming`, `let the team down`, `needs to step up`.
- The output does not editorialise about whether the sprint went well or badly. It does not say "great sprint", "rough sprint", or anything similar.
- The skill does not propose follow-up actions ("shall I file these as tickets?", "want me to message Alex?"). Stops after the closing line.
- Universal pass criteria (see `README.md`) all hold.
