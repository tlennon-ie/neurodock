---
name: chronometric-mark-start
description: Open a chronometric session by calling mark_session_start with the user's stated intent. Returns a session_id that later interventions quote back verbatim.
---

# chronometric-mark-start

Quick wrapper for the `mark_session_start` tool on the local NeuroDock
chronometric server (`neurodock-chronometric`). Captures the user's
plain-language framing of what they are about to do, so later nudges
(hyperfocus warnings, end-of-session reflection) can quote it back
unchanged.

Authoritative schema `$id`:
`https://schemas.neurodock.org/mcp-chronometric/v0.1.0/mark_session_start.schema.json`
([source](https://github.com/tlennon-ie/neurodock/blob/main/packages/mcp-chronometric/schemas/mark_session_start.schema.json)).

## When to use

- When the user announces a piece of focused work ("right, I'm going to
  finish the RFC reply now").
- At the top of a planning skill that wants to anchor the rest of the
  session against a stated intent.
- At the start of a pomodoro or timeboxed block.

## What it does

Calls `mcp__neurodock-chronometric__mark_session_start` with a single
`intent` string. The server:

1. Generates a UUIDv4 `session_id`.
2. Records `started_at` (ISO 8601 with offset).
3. Stores the `intent` verbatim — no paraphrase, no summarisation.
4. If a prior session was still open, may auto-close it; the response
   includes `auto_closed_prior_session` with the prior id and `closed_at`.

## How to invoke

Input shape:

```json
{
  "intent": "finish draft RFC reply"
}
```

Constraints:

- `intent` is required, 1–500 chars, plain language.
- Long intents (>200 chars) are themselves a hyperfocus signal — split
  before calling, or accept the warning.

Example response:

```json
{
  "session_id": "6f9f4f5e-3b1c-4e2a-9f7d-2b3c4d5e6f70",
  "started_at": "2026-05-23T09:14:22+01:00",
  "intent": "finish draft RFC reply",
  "auto_closed_prior_session": null
}
```

## What to do with the session_id

The `session_id` is opaque. Callers do NOT need to track it across calls —
`mark_session_end` always closes the most-recent open session for the user
by design (see [ADR 0001](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0001-chronometric-tool-design.md)
— avoids the LLM having to maintain state).

The id is useful for:

- Logging which session a piece of work belongs to.
- Cross-referencing in the cognitive graph (`source: "session://<id>"`).

## Errors

- `INTENT_REQUIRED` — empty/missing intent. Ask the user to state one.
- `INTENT_TOO_LONG` — over 500 chars. Truncate or split.
- `SESSION_ALREADY_OPEN` — only when the server is configured to reject
  overlaps. The default policy auto-closes.

## Limitations

- The tool is local-only; there is no remote sync of sessions in v0.1.0.
- Intent is stored verbatim including any PII the user types. Redaction
  is upstream; this server analyses what it is given.
- Auto-close behaviour is policy-dependent.

## Voice

Quote the intent back to the user in the confirmation. They said it; show
that you heard it. Do not add encouragement ("great goal!") — that is
exactly the sycophancy the project's manifesto rejects.
