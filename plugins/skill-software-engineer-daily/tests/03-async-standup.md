# Test 03 — Flow C: async standup writeup with zero blockers

**Scenario:** User says `async standup writeup`. The cognitive graph's `weekly_rollup` returns two facts from yesterday and one open session for today. Crucially, it returns ZERO `blocked_by` facts. The skill MUST render the standup with `Blockers: None.` rather than inventing a blocker, and MUST NOT add any praise language about yesterday.

This test is voice-heavy because it must assert what the skill does NOT say (`nice work yesterday`, `solid day`, `you got a lot done`) as well as what it does say. The no-praise property is load-bearing — the skill should respect that not every day deserves a pat on the back, and that adding one anyway is patronising.

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
`neurodock-chronometric` is mocked as available but unused in this flow.

Mocked `weekly_rollup({ "window": "yesterday" })` returns:

```json
{
  "window": "yesterday",
  "window_start": "2026-05-20T00:00:00+01:00",
  "window_end": "2026-05-20T23:59:59+01:00",
  "facts": [
    {
      "fact_id": "f5ee55ff-66aa-4bb5-cccd-5678901bcdef",
      "subject": {
        "type": "concept",
        "id": "c91d4e72-1b8a-4c5f-9d0e-2a3b4c5d6e7f",
        "name": "PR #482"
      },
      "predicate": "mentioned_in",
      "object": {
        "literal": "fixed the session-token race by switching to a monotonic version counter; PR is up for review"
      },
      "recorded_at": "2026-05-20T17:20:00+01:00"
    },
    {
      "fact_id": "f6ff66aa-77bb-4cc6-dddd-6789012cdef0",
      "subject": {
        "type": "concept",
        "id": "c91d4e72-1b8a-4c5f-9d0e-2a3b4c5d6e7f",
        "name": "PR #482"
      },
      "predicate": "decided_in",
      "object": {
        "literal": "agreed with reviewers to drop the deterministic-stub approach in favour of a real integration test"
      },
      "recorded_at": "2026-05-20T15:40:00+01:00"
    }
  ],
  "open_sessions": [
    {
      "session_id": "s7aa77bb-88cc-4dd7-eeee-7890123def01",
      "context": "review feedback on PR #482 — address the integration-test request from yesterday's discussion",
      "started_at": "2026-05-21T09:10:00+01:00"
    }
  ],
  "blockers": []
}
```

Note: `blockers` is an empty array. The skill MUST render Blockers as `None.` rather than inventing a blocker.

## User prompt

> async standup writeup

## Expected tool calls (in order)

1. `weekly_rollup({ "window": "yesterday" })` — exactly one call.

That is the only tool call in this flow. `decompose`, `recall_entity`, `record_fact`, `recall_decisions`, `mark_session_start`, `mark_session_end`, and `get_time_context` MUST NOT be called.

## Expected output

```
**Yesterday**
- fixed the session-token race by switching to a monotonic version counter; PR is up for review
- agreed with reviewers to drop the deterministic-stub approach in favour of a real integration test

**Today**
- review feedback on PR #482 — address the integration-test request from yesterday's discussion

**Blockers**
- None.

This is built from your recorded facts. I did not invent activity or blockers.
```

## Pass criteria specific to this test

**No-invention (the load-bearing property):**

- The literal substring `"fixed the session-token race by switching to a monotonic version counter; PR is up for review"` appears in the output exactly once — quoted verbatim from the mocked rollup.
- The literal substring `"agreed with reviewers to drop the deterministic-stub approach in favour of a real integration test"` appears in the output exactly once — quoted verbatim.
- The literal substring `"review feedback on PR #482 — address the integration-test request from yesterday's discussion"` appears in the output exactly once — quoted verbatim from `open_sessions[0].context`.
- The `Blockers` section contains the literal text `None.` (or `- None.`). The skill MUST NOT invent a blocker. Phrases like `waiting on...`, `blocked on...`, `needs review`, `awaiting feedback` MUST NOT appear in the Blockers section.
- The output does not mention any activity, task, decision, or session that is not in the mocked rollup.
- Exactly two bullets appear under `**Yesterday**` (matching the two facts).
- Exactly one bullet appears under `**Today**` (matching the one open session).

**No praise (the second load-bearing property):**

- The following praise/sympathy phrases MUST NOT appear anywhere in the output: `nice work`, `great work`, `great work yesterday`, `solid day`, `productive day`, `good job`, `nice job`, `you got a lot done`, `crushed it`, `solid progress`, `well done`, `keep it up`, `nice momentum`.
- The skill does not editorialise about whether yesterday was productive, tough, slow, or anything else. It does not add any framing sentence above `**Yesterday**`.
- The skill does not pre-praise today's plan either: `solid plan for today`, `good focus area`, `nice scope for the day` MUST NOT appear.
- The skill does not say `quiet day yesterday` or `light blockers list` — it just renders what the rollup returned.

**Structural correctness:**

- The three sections appear in order: `**Yesterday**`, `**Today**`, `**Blockers**`. Each on its own line, bold.
- The closing line `This is built from your recorded facts. I did not invent activity or blockers.` appears as the final line.
- The output is short enough to copy-paste into a Slack thread without trimming — no preamble, no header beyond the three section labels, no footer beyond the closing line.

**Tool-call correctness:**

- Exactly one tool call: `weekly_rollup({ "window": "yesterday" })`.
- No call to `decompose`, `recall_entity`, `record_fact`, `recall_decisions`, or any chronometric tool.
- The skill does NOT volunteer to call `record_fact` (does not ask `shall I save today's plan to the graph?`). The opt-in must come from the user; in this test it doesn't, so the call doesn't happen.

**Voice and banned phrases:**

- No words from the productivity-theatre banlist: `10x`, `ship faster`, `crush it`, `power through`, `grind`, `hustle`, `rockstar`, `ninja`, `synergy`, `growth mindset`, `stretch goal`, `should have known`.
- No clinical framing: the words `ADHD`, `ASD`, `executive function` MUST NOT appear.
- No accountability-theatre framing: `share this with the team`, `post in the channel`, `let your manager know`, `make sure to update Jira` MUST NOT appear.
- No invented urgency: `prioritise this`, `urgent`, `critical path`, `must finish today` MUST NOT appear unless quoted from a fact (none of the mocked facts contain those words, so they MUST NOT appear at all).
- Universal pass criteria (see `README.md`) all hold.
