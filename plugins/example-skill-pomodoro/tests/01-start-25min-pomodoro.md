# Test 01 — Default 25-minute Pomodoro start

**Scenario:** User asks for a Pomodoro without specifying a duration. Skill defaults to 25 minutes, parses the intent, opens the session, and confirms in one line.

## Given

Profile:

```yaml
identity:
  neurotypes: []
chronometric:
  hyperfocus_break_minutes: 90
```

`mcp-cognitive-graph` is NOT mocked as available for this test (so the skill must not attempt to call `record_fact` later).

No session is currently open. Mocked `get_time_context()` would return:

```json
{
  "now": "2026-05-20T10:02:14+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT0S",
  "current_session_length": "PT0S",
  "energy_zone": "morning_peak"
}
```

Mocked `mark_session_start({ "intent": "finish the inbox triage" })` returns:

```json
{
  "session_id": "7c4f9a2b-1d3e-4f5a-8b6c-9d0e1f2a3b4c",
  "started_at": "2026-05-20T10:02:14+01:00",
  "intent": "finish the inbox triage",
  "auto_closed_prior_session": null
}
```

## User prompt

> Start a pomodoro on the inbox triage.

## Expected tool calls (in order)

1. `get_time_context()` — verify no session is already open. Reads `current_session_length == "PT0S"`.
2. `mark_session_start({ "intent": "finish the inbox triage" })` — note the leading verb "finish" is added by the skill to turn the noun phrase into a stated intent; the user said "on the inbox triage" so the skill normalises to a complete sentence. Verbatim parroting of "the inbox triage" is also acceptable.

## Expected output

```
Pomodoro running. Intent: "finish the inbox triage". I'll surface a break suggestion at 25 minutes. Say "done" when you finish or "where am I" any time to check.
```

## Pass criteria specific to this test

- Exactly two tool calls in order: `get_time_context`, then `mark_session_start`.
- The intent string passed to `mark_session_start` is the same string echoed in the output, inside double-quotes.
- The number `25` appears literally in the output (default duration).
- `mark_session_end` is NOT called yet (the session is open).
- `record_fact` is NOT called.
- `request_break_if_needed` is NOT called (we are at 0 seconds elapsed).
- Universal pass criteria (see `README.md`) all hold.
