# Test 03 — Past threshold, soft nudge with verbatim prior intent

**Tier:** C
**Goal:** Verify that at or above the break threshold the skill prepends exactly one data line — including the user's verbatim prior intent and the suggested action — and then continues with the normal Tier-B response. The response is not blocked.

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
  "now": "2026-05-15T14:42:00+01:00",
  "day_of_week": "Friday",
  "time_since_last_prompt": "PT1M03S",
  "current_session_length": "PT1H42M00S",
  "energy_zone": "afternoon_dip"
}
```

Mocked `request_break_if_needed({ "threshold_minutes": 90 })` returns:

```json
{
  "elapsed": "PT1H42M",
  "prior_intent": "draft RFC reply",
  "suggested_action": "stand_and_stretch",
  "threshold_minutes": 90
}
```

## User prompt

> Help me sharpen the closing paragraph of the RFC reply.

## Expected transformed output

```
Session length: 102 minutes. You set the threshold at 90. Your stated intent: "draft RFC reply". Suggested next action: stand_and_stretch.

Tighten the closing by cutting the hedges and naming the next decision owner.

- Strike "I think" and "perhaps"; the surrounding paragraphs already establish that this is your read.
- Replace "we might want to consider" with the actual recommendation in one sentence.
- Name the decision owner explicitly — "Maintainer vote at the next meeting" beats "the group will decide".
- Move the open questions into a separate "Open questions" bullet list below the closing, not inside it.
- End on the action, not the caveat.

<details><summary>More detail</summary>

The current closing runs three sentences but only one of them carries weight. The first two hedge; the third asks. The hedges dilute the ask, so cutting them strengthens both. If the open questions feel important enough to keep inline, the closing is doing two jobs — separate them. A reader scanning the bottom of the RFC will read the last bullet first, so make that the action you actually want taken.

</details>
```

## Pass criteria specific to this test

- The prepended line is exactly ONE line, ending with a period.
- That line contains the literal substring `"draft RFC reply"` (verbatim from `prior_intent`, double-quoted).
- That line contains the literal substring `stand_and_stretch` (verbatim from `suggested_action`, unquoted).
- That line states the data plainly — session length, threshold — with no editorial verbs ("you've been", "still", "wow", "long", "a while").
- A blank line separates the prepended line from the Tier-B response.
- The Tier-B response is fully present; the user's request was answered, not refused.
- Visible bullets ≤ `max_chunk_size` (5).
- The word "hyperfocus" does not appear.
- Universal pass criteria (see `README.md`) all hold.
