# Test 03 — Full lifecycle: start, break trigger, close, record fact

**Scenario:** A simulated 26 minutes elapses inside the same conversation. The skill checks the timer, sees the 25-minute threshold has been crossed, calls `request_break_if_needed`, surfaces a one-line suggestion with the verbatim prior intent, the user says "done", the skill calls `mark_session_end`, and finally records an optional `pomodoro`-tagged fact in the cognitive graph.

This test exercises three of the four `mcp-chronometric` tools and the optional `mcp-cognitive-graph` integration in one flow.

## Given

Profile:

```yaml
identity:
  neurotypes: []
chronometric:
  hyperfocus_break_minutes: 90
```

`mcp-cognitive-graph` IS mocked as available.

A session is already open (started in a prior turn at 10:02:14). Mocked `get_time_context()` returns:

```json
{
  "now": "2026-05-20T10:28:30+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT26M16S",
  "current_session_length": "PT26M16S",
  "energy_zone": "morning_peak"
}
```

Mocked `request_break_if_needed({ "threshold_minutes": 25 })` returns:

```json
{
  "elapsed": "PT26M16S",
  "prior_intent": "finish the inbox triage",
  "suggested_action": "stand_and_stretch",
  "threshold_minutes": 25
}
```

Mocked `mark_session_end({})` returns:

```json
{
  "session_id": "7c4f9a2b-1d3e-4f5a-8b6c-9d0e1f2a3b4c",
  "started_at": "2026-05-20T10:02:14+01:00",
  "ended_at": "2026-05-20T10:28:42+01:00",
  "duration": "PT26M28S",
  "intent": "finish the inbox triage",
  "summary": null
}
```

Mocked `record_fact({ "subject": { "type": "session", "id": "7c4f9a2b-1d3e-4f5a-8b6c-9d0e1f2a3b4c" }, "predicate": "tagged", "object": { "literal": "pomodoro" } })` returns:

```json
{
  "fact_id": "f0e1d2c3-b4a5-4968-8472-635241302f1e",
  "recorded_at": "2026-05-20T10:28:42+01:00",
  "subject": {
    "type": "session",
    "id": "7c4f9a2b-1d3e-4f5a-8b6c-9d0e1f2a3b4c"
  },
  "predicate": "tagged",
  "object": { "literal": "pomodoro" },
  "deduplicated": false
}
```

## User prompts (in order)

Turn 1 (after the simulated wait):

> where am I

Turn 2 (after seeing the break suggestion):

> done

## Expected tool calls (in order)

1. `get_time_context()` — turn 1, to check elapsed time.
2. `request_break_if_needed({ "threshold_minutes": 25 })` — turn 1, because `current_session_length >= PT25M`.
3. `mark_session_end({})` — turn 2, because the user said "done". No summary because the user did not offer one.
4. `record_fact({ ... "predicate": "tagged", "object": { "literal": "pomodoro" } })` — turn 2, because `duration = PT26M28S >= PT20M` and `mcp-cognitive-graph` is available.

## Expected output

Turn 1 response:

```
25 minutes done. Stated intent: "finish the inbox triage". Suggested next: stand_and_stretch. Say "done" to close the session or "another" to start the next block.
```

Turn 2 response:

```
Session closed. Duration: 26 minutes 28 seconds. Tagged as pomodoro in the cognitive graph.
```

## Pass criteria specific to this test

- The break-suggestion line contains the literal substring `"finish the inbox triage"` (verbatim from `prior_intent`, double-quoted).
- The break-suggestion line contains the literal substring `stand_and_stretch` (verbatim from `suggested_action`, unquoted).
- The break-suggestion line states elapsed time plainly. No editorial verbs ("you've been", "still", "wow", "long", "almost").
- `mark_session_end` is called with NO `summary` field (the user did not offer one). Calling with `summary: null` or `summary: ""` is a failure — the optional field should be absent from the input.
- `record_fact` is called exactly once with `predicate: "tagged"` and `object.literal: "pomodoro"`. The subject must reference the same `session_id` returned by `mark_session_end`.
- Total tool-call count for the test: exactly 4.
- The word "hyperfocus" does not appear.
- The phrase "good job", "well done", "nice work" does not appear (no praise; just data).
- Universal pass criteria (see `README.md`) all hold.
