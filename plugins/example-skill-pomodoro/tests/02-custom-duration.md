# Test 02 — Custom 50-minute duration with explicit intent

**Scenario:** User asks for a longer block on a specific document. Skill parses both the duration (50) and the intent (the RFC), opens the session, and confirms in one line. The threshold for the later break trigger is 50 minutes, not the 25-minute default.

## Given

Profile:

```yaml
identity:
  neurotypes: []
chronometric:
  hyperfocus_break_minutes: 90
```

`mcp-cognitive-graph` IS mocked as available for this test (it will be called at session close if the duration warrants).

No session is currently open. Mocked `get_time_context()` returns:

```json
{
  "now": "2026-05-20T13:45:30+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT3M22S",
  "current_session_length": "PT0S",
  "energy_zone": "midday"
}
```

Mocked `mark_session_start({ "intent": "draft the RFC reply" })` returns:

```json
{
  "session_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "started_at": "2026-05-20T13:45:30+01:00",
  "intent": "draft the RFC reply",
  "auto_closed_prior_session": null
}
```

## User prompt

> Give me 50 minutes on the RFC reply.

## Expected tool calls (in order)

1. `get_time_context()` — verify no session is already open.
2. `mark_session_start({ "intent": "draft the RFC reply" })` — the skill normalises "the RFC reply" into a complete-sentence intent. Equivalent acceptable intents: `"work on the RFC reply"`, `"RFC reply"`. Whatever string is chosen MUST be the same string echoed in the output line.

## Expected output

```
Pomodoro running. Intent: "draft the RFC reply". I'll surface a break suggestion at 50 minutes. Say "done" when you finish or "where am I" any time to check.
```

## Pass criteria specific to this test

- Exactly two tool calls in order: `get_time_context`, then `mark_session_start`.
- The number `50` appears literally in the output (custom duration, not 25).
- The skill internally records `chosen_duration = 50` so test 03 (or a subsequent break-trigger turn) would call `request_break_if_needed({ "threshold_minutes": 50 })`.
- `request_break_if_needed` is NOT called in this test (we are at 0 seconds elapsed).
- `mark_session_end` is NOT called yet.
- `record_fact` is NOT called yet (the session is still open).
- The skill MUST NOT clamp the duration silently. If the user said 50, the threshold is 50.
- Universal pass criteria (see `README.md`) all hold.
