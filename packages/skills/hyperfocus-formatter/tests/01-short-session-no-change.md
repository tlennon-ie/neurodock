# Test 01 — Short session, light Answer-First

**Tier:** A
**Goal:** Verify that under 30 minutes the skill applies only a one-sentence summary on top of the original response, with no threshold mention.

## Given

Profile:
```yaml
preferences:
  output_format: "answer_first"
  max_chunk_size: 5
chronometric:
  hyperfocus_break_minutes: 90
```

Mocked `get_time_context()` returns:
```json
{
  "now": "2026-05-15T09:26:00+01:00",
  "day_of_week": "Friday",
  "time_since_last_prompt": "PT45S",
  "current_session_length": "PT12M00S",
  "energy_zone": "morning_peak"
}
```

`request_break_if_needed` is NOT called (session is below threshold and below the 30-minute tier boundary).

## User prompt

> What does `mark_session_start` actually persist to disk?

## Expected transformed output

```
mark_session_start writes a session row plus the intent string to the local SQLite file.

The session row contains: a generated session id, the start timestamp with timezone, the verbatim intent string from the caller, and a null end timestamp. The row lives in `~/.neurodock/chronometric.db`, table `sessions`. The intent is stored verbatim because downstream tools (notably `request_break_if_needed`) need to quote it back to the user without paraphrase. No remote calls. No telemetry. Closing the session via `mark_session_end` updates the same row in place with the end timestamp and optional summary.
```

## Pass criteria specific to this test

- First line ≤ 80 characters. Confirmed: 79 characters.
- First line followed by a blank line, then the original response unchanged.
- No bullet restructuring (Tier A is summary-only, not chunked).
- No mention of session length, threshold, or break suggestion.
- `request_break_if_needed` was not called.
- Universal pass criteria (see `README.md`) all hold.
