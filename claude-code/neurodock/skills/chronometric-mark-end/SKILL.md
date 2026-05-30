---
name: chronometric-mark-end
description: Close the currently open chronometric session, optionally attaching a verbatim summary. Triggers the auto-summary side effect used by weekly_rollup.
---

# chronometric-mark-end

Quick wrapper for `mark_session_end` on the local NeuroDock chronometric
server (`neurodock-chronometric`). Closes the most-recent open session and
returns its final metadata.

Authoritative schema `$id`:
`https://schemas.neurodock.org/mcp-chronometric/v0.1.0/mark_session_end.schema.json`
([source](https://github.com/tlennon-ie/neurodock/blob/main/packages/mcp-chronometric/schemas/mark_session_end.schema.json)).

## When to use

- When the user says they're done with a focused block.
- At the end of a planning skill that opened a session at the top.
- After detecting a hard context switch (long idle, calendar transition,
  explicit "I'm stopping").

## What it does

Calls `mcp__neurodock-chronometric__mark_session_end` with an optional
`summary`. The server:

1. Looks up the most recent open session for the user (no `session_id`
   argument — by design, per [ADR 0001](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0001-chronometric-tool-design.md)).
2. Stamps `ended_at` (ISO 8601 with offset).
3. Computes `duration` as an ISO 8601 duration string.
4. Stores the summary verbatim alongside the original `intent`.
5. Returns `session_id`, `started_at`, `ended_at`, `duration`, `intent`,
   `summary`.

### Side effect: weekly rollup feeds on this

The verbatim `intent` + `summary` pair is the unit consumed by the
cognitive graph's `weekly_rollup` tool. Sessions ended without a summary
are still included but contribute less signal. Encourage the user to write
a one-line summary even when nothing "finished" — `"got distracted into
refactor; did not finish the planned migration ADR"` is more useful than
no summary at all.

## How to invoke

Minimal:

```json
{}
```

With summary:

```json
{
  "summary": "shipped the RFC reply, parked two follow-ups in inbox"
}
```

Constraints:

- `summary` is optional, 1–1000 chars, plain language.
- No `session_id` field — the server picks the most recent open session.

Example response:

```json
{
  "session_id": "6f9f4f5e-3b1c-4e2a-9f7d-2b3c4d5e6f70",
  "started_at": "2026-05-23T09:14:22+01:00",
  "ended_at": "2026-05-23T10:42:18+01:00",
  "duration": "PT1H27M56S",
  "intent": "finish draft RFC reply",
  "summary": "shipped the RFC reply, parked two follow-ups in inbox"
}
```

## Errors

- `NO_OPEN_SESSION` — caller thought a session was open; it was not.
  Distinct from silent success so the caller can tell "I forgot to
  start one" from "this worked".
- `SUMMARY_TOO_LONG` — over 1000 chars. Trim and retry.

## Limitations

- Cannot end an arbitrary historical session — only the currently open one.
- If two sessions are open, only the most recent closes.
- Summary stored verbatim including PII; redaction is the caller's job.

## Voice

Read the duration back plainly. Do not editorialise ("wow, an hour!" — no).
Just the numbers and the user's own words. The summary is theirs, not
something to reformulate.
