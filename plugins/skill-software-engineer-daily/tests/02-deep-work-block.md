# Test 02 — Flow B: plan a 2-hour deep-work block

**Scenario:** User says `plan my deep-work block, I have 2 hours`. The skill asks for a description of the open work, the user pastes a short paragraph, the skill calls `decompose` with a 2-hour budget passed as the ISO 8601 string `"PT2H"`, and renders 4 atomic tasks plus a one-line `FIRST:` verdict.

The load-bearing property of this test: the `time_budget` argument to `decompose` MUST be the ISO 8601 string `"PT2H"`, NOT the natural-language string `"2 hours"`, NOT `"2h"`, NOT `"120 minutes"`, NOT a number like `120`. The task-fractionator's contract is ISO 8601 and the skill MUST honour that.

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
`neurodock-chronometric` is mocked as available but NOT used because the user does not opt in to session bracketing.

Mocked `decompose` is expected to be called with:

```json
{
  "goal": "Migrate the payments service from the old in-process retry to the shared retry queue. The service still uses the local exponential-backoff helper for Stripe webhook retries; we want to switch it to the new shared queue so retries survive a process restart. Behaviour needs to be unchanged from the outside.",
  "time_budget": "PT2H"
}
```

Mocked response:

```json
{
  "tasks": [
    {
      "sequence": 1,
      "title": "Read the shared-retry-queue interface and capture the API shape",
      "estimated_minutes": 25,
      "acceptance_criteria": [
        "A short note (in the PR description or a scratch doc) lists the queue's enqueue, ack, and retry-policy surface."
      ],
      "tags": ["reading", "investigation"],
      "dependencies": []
    },
    {
      "sequence": 2,
      "title": "Write a failing integration test for restart-survival",
      "estimated_minutes": 35,
      "acceptance_criteria": [
        "Test enqueues a retry, kills the process, restarts it, and asserts the retry still fires. It fails against the current in-process implementation."
      ],
      "tags": ["test"],
      "dependencies": [1]
    },
    {
      "sequence": 3,
      "title": "Swap the retry call site to the shared queue",
      "estimated_minutes": 40,
      "acceptance_criteria": [
        "The Stripe webhook retry path calls the shared queue. The failing test from sequence 2 passes."
      ],
      "tags": ["implementation"],
      "dependencies": [2]
    },
    {
      "sequence": 4,
      "title": "Delete the in-process exponential-backoff helper",
      "estimated_minutes": 20,
      "acceptance_criteria": [
        "The helper module is removed. The full test suite passes. No remaining references in the payments service."
      ],
      "tags": ["cleanup"],
      "dependencies": [3]
    }
  ]
}
```

## User prompts (in order)

Turn 1:

> plan my deep-work block, I have 2 hours

Turn 2 (in response to the skill asking for the open work):

> Migrate the payments service from the old in-process retry to the shared retry queue. The service still uses the local exponential-backoff helper for Stripe webhook retries; we want to switch it to the new shared queue so retries survive a process restart. Behaviour needs to be unchanged from the outside.

## Expected tool calls (in order)

1. `decompose({ "goal": "<the user's pasted description, verbatim>", "time_budget": "PT2H" })` — exactly one call, in turn 2.

No other tool calls in this flow. `recall_entity`, `record_fact`, `weekly_rollup`, `recall_decisions`, `mark_session_start`, `mark_session_end`, and `get_time_context` MUST NOT be called.

## Expected output

Turn 1 response:

```
What's the open work? Paste a brief description, a ticket title, or a sentence about what you want to make progress on.
```

Turn 2 response:

```
Deep-work plan — 2 hours, 4 atomic tasks.

- Read the shared-retry-queue interface and capture the API shape (25 min)
  Acceptance: A short note (in the PR description or a scratch doc) lists the queue's enqueue, ack, and retry-policy surface.
- Write a failing integration test for restart-survival (35 min)
  Acceptance: Test enqueues a retry, kills the process, restarts it, and asserts the retry still fires. It fails against the current in-process implementation.
- Swap the retry call site to the shared queue (40 min)
  Acceptance: The Stripe webhook retry path calls the shared queue. The failing test from sequence 2 passes.
- Delete the in-process exponential-backoff helper (20 min)
  Acceptance: The helper module is removed. The full test suite passes. No remaining references in the payments service.

FIRST: Read the shared-retry-queue interface and capture the API shape.

These tasks fit the budget you gave me. I did not invent scope.
```

## Pass criteria specific to this test

**ISO 8601 enforcement (the load-bearing property):**

- Exactly one tool call: `decompose`, called in turn 2.
- The `time_budget` argument to `decompose` is the literal ISO 8601 string `"PT2H"`. The following alternative renderings MUST NOT appear as the `time_budget` value: `"2 hours"`, `"2h"`, `"2 hour"`, `"120 minutes"`, `"120m"`, `120`, `"P0DT2H"` (only `PT2H` is canonical for two hours), or any other variant.
- The `goal` argument to `decompose` is the user's turn-2 paragraph verbatim. No paraphrasing, no truncation, no normalisation.

**Structural correctness:**

- Turn 1 response is exactly one sentence asking for the open work. No editorial framing, no `welcome to the planner`, no `let's get started`.
- Turn 2 response contains exactly four task bullets, matching the four mocked tasks, in declaration order.
- Each task title appears verbatim from the `decompose` response — not paraphrased.
- Each task's first acceptance criterion appears verbatim under `Acceptance:`.
- Estimated minutes appear verbatim (`25`, `35`, `40`, `20`) — no rounding to `~30`, no restating as `"about half an hour"`.
- The `FIRST:` line is the title of sequence 1 (`Read the shared-retry-queue interface and capture the API shape`) because it has `dependencies == []` and is the lowest-`sequence` task with no dependencies.
- The closing line `These tasks fit the budget you gave me. I did not invent scope.` appears as the final line of turn 2.

**No-invention:**

- The skill does not invent additional tasks beyond the four returned.
- The skill does not invent a fifth `nice-to-have` task, a documentation task not in the response, or a `merge the PR` task.
- The skill does not propose what to do after the 2-hour block ends.
- The skill does not ask `do you want me to start a timer?` or volunteer to bracket the session — the user did not opt in.

**Tool-call correctness:**

- No call to `mark_session_start` (no user opt-in).
- No call to `recall_entity`, `record_fact`, `weekly_rollup`, or any other tool.

**Voice and banned phrases:**

- No words from the banlist: `10x`, `ship faster`, `crush it`, `power through`, `grind`, `hustle`, `rockstar`, `ninja`, `synergy`, `growth mindset`, `stretch goal`, `should have known`.
- No praise or sympathy theatre: `nice work`, `great work`, `let's crush this`, `you got this`, `solid plan`, `looks great` MUST NOT appear.
- No clinical framing: the words `ADHD`, `ASD`, `executive function` MUST NOT appear.
- The skill does not editorialise about the difficulty of the work (`this is going to be tough`, `tight budget`, `aggressive`).
- Universal pass criteria (see `README.md`) all hold.
