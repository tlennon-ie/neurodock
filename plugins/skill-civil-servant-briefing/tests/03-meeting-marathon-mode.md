# Test 03 — Flow C: meeting marathon mode for a sitting-day with explicit EOD restore

**Scenario:** User says `meeting marathon mode` ahead of a sitting-day with six or more back-to-back meetings. The skill confirms the scope (today only), surfaces the three temporary threshold numbers (gentle 90 / nudge 150 / hard 210 minutes) as integers, marks the session in `neurodock-chronometric` with a verbatim intent so the substrate's break-suggestion logic knows the marathon context, and emits a structured restoration block stating the defaults restore at midnight local. The threshold change is explicitly temporary — the structured output makes the default-restore-at-EOD a hard contract.

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
`neurodock-cognitive-graph` is mocked as available but unused in this flow.
`neurodock-chronometric` IS mocked as available.

Mocked `mark_session_start` accepts the call with the intent string below and returns:

```json
{
  "session_id": "s4d5e6f7-a8b9-4cde-90ab-cdef00000001",
  "started_at": "2026-05-21T08:00:00+01:00",
  "intent": "meeting marathon — 6+ scheduled meetings, raised break thresholds (gentle 90, nudge 150, hard 210) until EOD"
}
```

## User prompts (in order)

Turn 1:

> meeting marathon mode

Turn 2 (answering the confirmation question):

> yes proceed

## Expected tool calls (in order)

1. `mark_session_start({ "intent": "meeting marathon — 6+ scheduled meetings, raised break thresholds (gentle 90, nudge 150, hard 210) until EOD" })` — called in turn 2 after the user confirms.

That is the only tool call in this flow. `decompose`, `recall_entity`, `record_fact`, `recall_decisions`, `request_break_if_needed`, and `mark_session_end` MUST NOT be called.

## Expected output

Turn 1 response (asking the confirmation question):

```
Confirming marathon mode for today only — gentle nudge at 90 minutes, firm nudge at 150, hard stop at 210. Default thresholds restore at midnight local. Proceed?
```

Turn 2 response (after the user confirms):

```
Meeting marathon mode — confirmed for today only.

### Thresholds (temporary)
- Gentle nudge: 90 minutes
- Firm nudge: 150 minutes
- Hard stop: 210 minutes

### Restoration
- Default thresholds restore automatically at 00:00 local.
- This change applies to today's sitting-day only.

The substrate's break-suggestion logic will respect these values for the rest of today.
```

## Pass criteria specific to this test

**Structured threshold values (the load-bearing property):**

- The output contains the three threshold numbers as integers, in this exact form:
  - The literal substring `"Gentle nudge: 90 minutes"` appears.
  - The literal substring `"Firm nudge: 150 minutes"` appears.
  - The literal substring `"Hard stop: 210 minutes"` appears.
- The numbers are surfaced as integers (`90`, `150`, `210`), not approximations (`~90`, `about 90`, `roughly 90`).
- The three thresholds appear in the order gentle → firm → hard, matching the escalation sequence (a firm nudge is louder than a gentle one; a hard stop is louder still).

**Explicit temporary scope (the load-bearing property):**

- The literal substring `"Default thresholds restore automatically at 00:00 local."` appears in turn 2's response.
- The literal substring `"This change applies to today's sitting-day only."` appears in turn 2's response.
- The `### Restoration` heading appears in turn 2's response.
- The literal substring `"today only"` appears in BOTH turn 1 (in the confirmation question) and turn 2 (in the header). The skill names the temporary scope twice — once before the user confirms, once after.
- The skill does NOT say `"until you turn it off"`, `"indefinitely"`, `"permanently"`, `"as long as you like"`, or any phrasing that implies the change persists past midnight.

**Tool-call correctness:**

- Exactly one tool call: `mark_session_start` in turn 2.
- The `intent` argument is the literal string `"meeting marathon — 6+ scheduled meetings, raised break thresholds (gentle 90, nudge 150, hard 210) until EOD"` — character-for-character.
- The intent string contains all three threshold numbers (`90`, `150`, `210`) and the word `EOD` so that the substrate's break-suggestion logic has the calibration on file when it polls.
- No call to `decompose`, `recall_entity`, `record_fact`, `request_break_if_needed`, `mark_session_end`, or `recall_decisions`.
- The skill does NOT call `mark_session_start` in turn 1 (before user confirmation). The opt-in is non-skippable.

**Voice and banned phrases:**

- No coaching, no encouragement: the phrases `"good luck"`, `"you've got this"`, `"power through"`, `"keep going"`, `"stay strong"` MUST NOT appear.
- No clinical framing: `ADHD`, `ASD`, `executive function`, `burnout`, `overwhelm` MUST NOT appear in skill output.
- No meeting-facilitation advice: `"set an agenda"`, `"keep meetings on time"`, `"action items"`, `"meeting hygiene"` MUST NOT appear.
- No puffery: `world-class`, `bold`, `courageous`, `paradigm shift` MUST NOT appear.
- The skill does not propose follow-up actions (`"shall I block your calendar?"`, `"want me to draft an out-of-office?"`). Stops after the closing line of turn 2.
- The first sentence of turn 2 (`Meeting marathon mode — confirmed for today only.`) is ≤ 100 characters.
- Universal pass criteria (see `README.md`) all hold.

## Variant — chronometric MCP unavailable

If `neurodock-chronometric` is mocked as NOT available, the expected output for turn 2 changes only in the closing line:

```
The chronometric MCP is not connected — these thresholds are noted but the substrate's nudges are not currently wired.
```

In this variant:

- No tool call is made (no `mark_session_start`, no anything).
- The `### Thresholds (temporary)` and `### Restoration` blocks appear unchanged. The threshold numbers and the EOD-restore contract are still surfaced — the user is told what mode the skill agreed to even when the substrate cannot enforce it.
- The skill does NOT silently degrade. The replaced closing line is the explicit signal.
