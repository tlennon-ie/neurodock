---
name: example-skill-pomodoro
version: 0.1.0
description: A 25-minute Pomodoro coach — opens a session anchored to a stated intent, surfaces a break suggestion at the user-chosen duration, and closes the session on user signal.
neurotypes: []
status: stable
triggers:
  - phrase: "start a pomodoro"
  - phrase: "begin a pomodoro"
  - phrase: "let's focus for 25"
  - phrase: "give me 25 minutes"
  - phrase: "give me 50 minutes"
  - phrase: "25 minute session"
  - phrase: "pomodoro on"
mcp_dependencies:
  - server: mcp-chronometric
    tools:
      [
        mark_session_start,
        get_time_context,
        request_break_if_needed,
        mark_session_end,
      ]
  - server: mcp-cognitive-graph
    tools: [record_fact]
    optional: true
profile_dependencies:
  - chronometric.hyperfocus_break_minutes
license: AGPL-3.0-or-later
authors:
  - NeuroDock contributors
---

# example-skill-pomodoro

A small Pomodoro coach. The user says they want to focus for a fixed block; this skill opens a session anchored to a stated intent, surfaces a break suggestion at the chosen duration, and closes the session on the user's word. An optional fact is recorded so weekly rollups can count completed pomodoros. Default block is 25 minutes; the user can override with any value in the 1–480 minute range.

## When to activate

Activate when the user's message contains one of the trigger phrases above, OR when it asks to focus for a specific duration in minutes ("focus for 40", "give me an hour on the RFC"). Do NOT activate when a session is already open in `mcp-chronometric` (call `get_time_context` first; if `current_session_length` is not `PT0S`, surface the existing session instead of starting a new one), or when the message is past-tense ("I did a pomodoro this morning" is a reflection, not a start signal).

## Operating instructions

The LLM owns the wall-clock timing between steps 2 and 3.

1. **Open the session.** Parse the duration (default 25). Parse the intent — everything after "on", "for", or the last preposition is usually the intent; if no intent is stated, ask for it in one sentence before calling the tool. Call `mark_session_start({ "intent": "<intent>" })`.

2. **Confirm and step back.** One line: `Pomodoro running. Intent: "<intent>". I'll surface a break suggestion at <duration> minutes. Say "done" when you finish or "where am I" any time to check.`

3. **Periodic check (LLM-owned timing).** When the user prompts again during the session, call `get_time_context()` and read `current_session_length`. Below threshold: answer the user's actual question normally, do not nag the timer. Surface a status line only if explicitly asked.

4. **Break trigger.** When `current_session_length >= <duration>`, call `request_break_if_needed({ "threshold_minutes": <duration> })`. Three outcomes:

   - `null` (race condition; session was reset) — skip the suggestion silently.
   - Object — emit one line quoting `prior_intent` verbatim and naming `suggested_action`. Format: `<duration> minutes done. Stated intent: "<prior_intent>". Suggested next: <suggested_action>. Say "done" to close the session or "another" to start the next block.`
   - Error — surface the error code as one line; do not pretend the timer ran cleanly.

5. **Close the session.** On "done", "finished", "that's it", or acceptance of the break suggestion, call `mark_session_end({ "summary": "<summary if offered, otherwise omit>" })`. Echo the returned `duration` in one line.

6. **Optional: record the fact.** If `mcp-cognitive-graph` is installed AND `duration >= PT20M`, call `record_fact({ "subject": { "type": "session", "id": "<session_id>" }, "predicate": "tagged", "object": { "literal": "pomodoro" } })`. Lets `weekly_rollup` count completed pomodoros. If `mcp-cognitive-graph` is absent, skip silently.

7. **Stop.** Do not propose the next pomodoro unless the user asks.

## Outputs

- **On start:** one line confirming session, intent, and chosen duration.
- **On explicit "where am I":** one line stating elapsed time and intent.
- **On break trigger:** one line with elapsed time, verbatim prior intent, suggested action.
- **On close:** one line with duration and (if provided) summary.

Lines fit in 100 characters where possible. No headers. No bullet lists. Small on purpose.

## Do not

- Do not start a second session while one is already open. Surface the existing session instead.
- Do not editorialise the duration ("nice 25 minutes!"). State the data plainly.
- Do not paraphrase `prior_intent`. Quote it verbatim, inside double-quotes.
- Do not lecture about Pomodoro technique. The user knows what they asked for.
- Do not block or refuse. If the user wants a 90-minute "pomodoro", honour it — it's their session.
- Do not invent a `suggested_action` value. Use the exact string returned by `request_break_if_needed`.
- Do not record a fact in `mcp-cognitive-graph` for sessions shorter than 20 minutes (those are user-initiated cancels, not completions).

## What this skill is not

- Not a productivity tracker.
- Not a focus enforcer — the user can break the block any time.
- Not a clinical intervention.
- Not the canonical NeuroDock Pomodoro skill (this is a reference example for plugin authors; ship your own version with the framing your users need).

## Examples

See `tests/`:

- `01-start-25min-pomodoro.md` — default 25-minute start.
- `02-custom-duration.md` — user-specified 50-minute block with explicit intent.
- `03-break-trigger.md` — full lifecycle including break suggestion and session close.
