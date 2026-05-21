# Test 03 — Flow C: exec summary with word budget enforced at render-time

**Scenario:** User says `exec summary for the cache outage last Tuesday, max 120 words`. The skill calls `decompose` with a goal that explicitly names the 4-section structure (`Why now / What changed / Decision needed / Risk if delayed`), receives four atomic tasks, maps them to the four sections, and renders a verdict-first summary whose word count fits inside the 120-word budget.

This test's load-bearing property is **word-budget awareness**: the final rendered output's word count (verdict + 4 bullet contents) MUST be ≤ 120, and the closing line MUST surface the actual count so the user can verify.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-cognitive-graph` IS mocked as available but unused in this flow.
`neurodock-task-fractionator` IS mocked as available.

Mocked `decompose` is called with:

```json
{
  "goal": "exec summary for the cache outage last Tuesday: produce 4 atomic bullets in the order Why now / What changed / Decision needed / Risk if delayed",
  "time_budget": "PT30M"
}
```

Mocked response:

```json
{
  "tasks": [
    {
      "id": "11111111-2222-4333-8444-555555555555",
      "sequence": 1,
      "title": "Why now: cache outage tripped the Tuesday morning peak and breached the SLA",
      "description": "Outage lasted forty minutes during the 09:00–10:00 traffic window. SLA target is 99.9%; April-to-May we are at 99.82%. One more comparable incident this quarter and the customer-facing dashboard flips red, which triggers the credit clause in three of the top-ten contracts.",
      "estimated_minutes": 10,
      "acceptance_criteria": ["Verdict on the action is unambiguous."],
      "dependencies": [],
      "tags": ["section:why-now"]
    },
    {
      "id": "22222222-3333-4444-8555-666666666666",
      "sequence": 2,
      "title": "What changed: stale-data window was longer than any prior incident",
      "description": "The TTL bump shipped Monday night extended the staleness window from the historical 8 minutes to 40 minutes. The invalidation-key bump that would have kept the window short was missed by the review process — there is no checklist item for cache-invalidation interactions.",
      "estimated_minutes": 10,
      "acceptance_criteria": [
        "Root cause is named in process terms, not personal terms."
      ],
      "dependencies": [1],
      "tags": ["section:what-changed"]
    },
    {
      "id": "33333333-4444-4555-8666-777777777777",
      "sequence": 3,
      "title": "Decision needed: approve staging-fidelity hire backfill this quarter, not next",
      "description": "Backfill the staging-environment-fidelity role this quarter so we can replay production cache load in staging before the next TTL change ships. Open headcount exists; the ask is permission to backfill against it now.",
      "estimated_minutes": 10,
      "acceptance_criteria": [
        "Decision ask is one sentence, ends with a question or imperative."
      ],
      "dependencies": [2],
      "tags": ["section:decision-needed"]
    },
    {
      "id": "44444444-5555-4666-8777-888888888888",
      "sequence": 4,
      "title": "Risk if delayed: one more comparable incident this quarter triggers credit clauses",
      "description": "Without the staging-fidelity backfill, the next TTL or cache-invalidation change ships with the same review-process gap. Three of the top-ten contracts contain SLA credit clauses that fire at the third breach in a rolling quarter. We are at breach two.",
      "estimated_minutes": 10,
      "acceptance_criteria": ["Risk is quantified or scoped, not hand-waved."],
      "dependencies": [],
      "tags": ["section:risk-if-delayed"]
    }
  ],
  "rationale": "Four-bullet exec-summary structure: timing, cause, ask, cost-of-delay. Each bullet is atomic and independently checkable."
}
```

## User prompt

> exec summary for the cache outage last Tuesday, max 120 words

## Expected tool calls (in order)

1. `decompose` — single call. The arguments MUST be:

   - `goal`: the literal string `"exec summary for the cache outage last Tuesday: produce 4 atomic bullets in the order Why now / What changed / Decision needed / Risk if delayed"` (the topic, prefixed by `exec summary for` and suffixed with the 4-section structure declaration).
   - `time_budget`: the literal ISO 8601 string `"PT30M"`.

No other tool calls in this flow. `recall_entity`, `recall_decisions`, and `record_fact` MUST NOT be called.

## Expected output (illustrative; the exact prose may vary as long as the assertions below hold)

```
Verdict: Backfill the staging-fidelity role this quarter — one more cache-outage-class incident triggers SLA credit clauses on three top-ten contracts.

- **Why now.** Tuesday's outage breached the SLA during morning peak. We are at 99.82% against a 99.9% target. One more comparable incident this quarter flips the dashboard red and triggers credit clauses.
- **What changed.** Monday's TTL bump extended staleness from 8 minutes to 40 minutes. The invalidation-key bump was missed in review; no checklist item covers cache-invalidation interactions.
- **Decision needed.** Approve backfilling the staging-environment-fidelity role this quarter, against open headcount, so the next TTL change is rehearsed against production-equivalent load.
- **Risk if delayed.** The review-process gap remains. The next breach is the third — credit clauses fire automatically. Three top-ten contracts are exposed.

Word count: 118/120.
```

## Pass criteria specific to this test

**Tool-call correctness:**

- Exactly one tool call: `decompose`.
- The `goal` argument is a string that STARTS WITH `"exec summary for the cache outage last Tuesday"` (the topic verbatim, including the user's `the cache outage last Tuesday` phrasing).
- The `goal` argument CONTAINS the literal substring `"Why now / What changed / Decision needed / Risk if delayed"` (the 4-section structure declaration — this is what makes `decompose` produce the four-bullet shape).
- The `time_budget` argument is the literal ISO 8601 string `"PT30M"`.
- No call to `recall_entity`, `recall_decisions`, `record_fact`, `mark_session_start`, `mark_session_end`, or `get_time_context`.

**Word-budget enforcement (THE load-bearing property of this flow):**

- The total word count of the verdict line + the four bullet contents (NOT counting the section labels `**Why now.**` etc., NOT counting the `Word count:` line) is ≤ 120.
- The output's final line is `Word count: <actual>/120.` where `<actual>` is the exact integer word count of the verdict + bullets, and `<actual>` ≤ 120.
- If `<actual>` > 120, the test FAILS. The skill MUST tighten the prose until the budget fits — it does not negotiate the budget upward.

**Structural correctness:**

- The first line of the output starts with the literal substring `"Verdict:"`. No preamble before it. No `"Here is your exec summary:"`, no `"As requested:"`, no greeting.
- The four bullets appear in the order `**Why now.**`, `**What changed.**`, `**Decision needed.**`, `**Risk if delayed.**`. Reordering FAILS the test.
- Each bullet's section label is bolded inline (`**Why now.**`), not rendered as a section header (`### Why now`).
- The output contains exactly four bullets matching the four sections. No fifth bullet, no "next steps" bullet.
- The `Decision needed.` bullet ends with either an imperative or a question mark — not a hedge. The phrases `"we could consider"`, `"perhaps"`, `"might want to"` MUST NOT appear in the `Decision needed` bullet.

**Verdict correctness:**

- The verdict line is ONE sentence, ≤ 200 characters. It is the punchline — the exec should walk away with this even if they read nothing else.
- The verdict line MUST NOT start with `"In summary,"`, `"Overall,"`, `"To recap,"`, `"Essentially,"` — verdict-first means verdict-first, no preamble inside the sentence either.

**Voice and banned phrases:**

- No words from the banlist: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`, `aligned`, `north star`, `circle back`, `actionable insights`, `mission-critical`, `at the end of the day`.
- No clinical framing: `ADHD`, `ASD`, `executive function`, `OCD`, `neurodivergent` MUST NOT appear.
- No follow-up offers: `"want a deck?"`, `"want the long version?"`, `"shall I send this?"`, `"anything else?"` MUST NOT appear. The skill stops after the `Word count:` line.
- The output never names a person as the cause of the outage. The `What changed` bullet describes the process gap, not a person.
- Universal pass criteria (see `README.md`) all hold.
