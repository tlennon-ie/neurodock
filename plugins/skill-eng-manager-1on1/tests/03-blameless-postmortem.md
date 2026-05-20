# Test 03 — Flow C: blameless postmortem with five Whys and system factors

**Scenario:** User says `blameless postmortem on the cache outage from last Tuesday`. The skill anchors the incident, walks five Whys (re-routing any blame-tinged user phrasing back to system factors), then asks which system factors were in play and renders the postmortem skeleton. No person is ever named as the cause. The user does NOT opt in to graph capture, so `record_fact` is not called.

This test is the most behaviour-heavy of the three because it must assert what the skill says AND what it does not say. The blame-avoidance is the load-bearing property.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-task-fractionator` is mocked as available but unused in this flow.
`mcp-cognitive-graph` is mocked as available but NOT used because the user does not opt in.

No fixture responses are needed — Flow C is conversational and does not call any tool unless the user opts in at the end.

## User prompts (in order)

Turn 1:

> blameless postmortem on the cache outage from last Tuesday

Turn 2 (answering the first Why):

> the cache was returning stale data for about forty minutes during the morning peak

Turn 3 (answering the second Why):

> we shipped a config change the night before that changed the TTL but didn't bump the invalidation key

Turn 4 (answering the third Why, and the user gets blame-y):

> honestly Tom should have caught it in review, that's literally what reviews are for

Turn 5 (answering the rerouted third Why):

> the review template doesn't have a checklist item for cache-invalidation interactions, and we don't have a linter for it either

Turn 6 (answering the fourth Why):

> the staging environment doesn't replay production cache load, so the staleness wasn't visible until prod

Turn 7 (answering the fifth Why):

> nobody has owned staging-environment fidelity since the platform-team split eighteen months ago

Turn 8 (answering the system-factors question):

> documentation gap, observability gap, and capacity gap

## Expected tool calls (in order)

ZERO tool calls in this entire flow. The user does not opt in to `record_fact`.

This is by design: Flow C is conversational, the skill never volunteers to call `record_fact`, and the cognitive graph stays untouched unless the user explicitly asks for capture.

## Expected output

Turn 1 response:

```
Walking a blameless postmortem on: the cache outage from last Tuesday. I'll ask five Whys, then map system factors. We will not name a person as cause.

Why did the system enter that state?
```

Turn 2 response (asking the second Why):

```
Why did that condition — stale data for forty minutes during morning peak — become possible?
```

Turn 3 response (asking the third Why, grounded in turn 2's answer):

```
Why did the change-gate allow a TTL change without a matching invalidation-key bump?
```

Turn 4 response (rerouting the user's blame at Tom back to the system around Tom):

```
Understood — and the postmortem still won't name a person. The review process is what we're examining, not the reviewer. Restating: why did the review process not flag the cache-invalidation interaction?
```

Turn 5 response (asking the fourth Why):

```
Why did staging not surface the staleness before it reached production?
```

Turn 6 response (asking the fifth Why):

```
Why has staging-environment fidelity been allowed to drift from production?
```

Turn 7 response (transitioning to system factors):

```
Five Whys logged. Which system factors were in play? (You can name more than one.)

- Documentation gap — runbook missing, stale, or wrong.
- Observability gap — the system did not surface the problem in time.
- Change-gate gap — the deploy/review/test process let the issue through.
- Capacity gap — the team was stretched; the work could not get the attention it needed.
- Tool gap — the available tools made the safe path harder than the unsafe path.
- Context gap — the person doing the work did not have the information they would have needed (and this is the system's job to fix, not theirs).
```

Turn 8 response (rendering the skeleton):

```
Postmortem skeleton — the cache outage from last Tuesday

### Why chain
1. Why? the cache was returning stale data for about forty minutes during the morning peak
2. Why? we shipped a config change the night before that changed the TTL but didn't bump the invalidation key
3. Why? the review template doesn't have a checklist item for cache-invalidation interactions, and we don't have a linter for it either
4. Why? the staging environment doesn't replay production cache load, so the staleness wasn't visible until prod
5. Why? nobody has owned staging-environment fidelity since the platform-team split eighteen months ago

### System factors in play
- Documentation gap
- Observability gap
- Capacity gap

### What this postmortem does NOT contain
- A person named as cause.
- A remediation action list (that is a follow-up conversation).
- A judgement about whether the incident was avoidable.
```

## Pass criteria specific to this test

**Blame-avoidance (the load-bearing property):**

- The literal string `"Tom"` (or any other proper name a user might introduce) MUST NOT appear in ANY skill-emitted turn (turns 1, 2, 3, 4, 5, 6, 7, 8). User-emitted turns containing names are fine — the skill does not censor the user, it just does not echo the name back.
- The skill's turn 4 response MUST contain the literal substring `"the postmortem still won't name a person"` (the acknowledgement-and-redirect pattern from the SKILL.md distress-signal section).
- No blaming Why phrasings appear in any skill turn. The literal substrings `"should have"`, `"failed to"`, `"didn't"` followed by a person reference, `"dropped the ball"`, `"missed it"`, `"wasn't paying attention"` MUST NOT appear in skill output. (Note: `"didn't bump the invalidation key"` in turn 8's quoted user content is fine — it's quoting the user verbatim, and it's about a change, not a person.)
- The final skeleton's `### Why chain` section quotes the user's answers verbatim from turns 2, 5, 6, 7 — but uses the REROUTED Why content from turn 5 for Why #3, NOT the user's blame-tinged answer from turn 4. The blame-tinged answer is discarded; the rerouted answer is the canonical record.

**Structural correctness:**

- Exactly five entries appear under `### Why chain` in turn 8.
- The system-factors section in turn 8 lists exactly three factors, matching the user's turn-8 answer: `Documentation gap`, `Observability gap`, `Capacity gap`. The other three options (Change-gate gap, Tool gap, Context gap) MUST NOT appear in the skeleton.
- The `### What this postmortem does NOT contain` block appears verbatim as specified in SKILL.md, with all three bullets.
- The incident phrase `"the cache outage from last Tuesday"` appears verbatim in turn 1 and in turn 8's header.

**Tool-call correctness:**

- ZERO tool calls in this entire flow. No `decompose`, no `recall_entity`, no `record_fact`, no `mark_session_start`, no `get_time_context`.
- The skill does NOT volunteer to call `record_fact` (does not ask "shall I record this?"). The opt-in must come from the user; in this test it doesn't, so the call doesn't happen.

**Voice and banned phrases:**

- The skill never proposes remediation actions. The phrases `"action item"`, `"next steps"`, `"remediation"`, `"follow-up tasks"`, `"shall we fix"` MUST NOT appear in skill output.
- No words from the manager-speak banlist: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`, `should have known`, `underperforming`, `let the team down`, `needs to step up`.
- No clinical framing: the words `ADHD`, `ASD`, `executive function` MUST NOT appear.
- No praise or sympathy theatre: `nice work`, `great job`, `that's tough`, `sorry to hear` MUST NOT appear.
- Universal pass criteria (see `README.md`) all hold.
