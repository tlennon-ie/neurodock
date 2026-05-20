# Sample conversation — Claude Desktop + NeuroDock

A realistic dialogue showing the morning-brief loop: time context, session
start, a real working interval, a break suggestion, session end, and recording
something for later recall.

This isn't an idealised transcript. The model occasionally over-talks, asks
about things you didn't request, and sometimes mis-shapes tool arguments on the
first try. That's normal. The substrate doesn't fix Claude — it gives Claude
better context to work with.

Profile assumed for this transcript:

```yaml
identity:
  display_name: "Thomas"
  neurotypes: ["adhd"]
preferences:
  output_format: "answer_first"
  motion: "reduced"
chronometric:
  hyperfocus_break_minutes: 90
  end_of_day_local: "18:30"
```

---

## 08:34 — Morning brief

**You:**

> Morning. What's on the table today?

**Claude (invokes `get_time_context`)**

```json
{
  "local_time": "2026-05-20T08:34:12+10:00",
  "day_of_week": "Tuesday",
  "energy_zone": "morning_focus",
  "minutes_until_end_of_day": 596,
  "session_active": false
}
```

**Claude:**

> 08:34, Tuesday. Morning-focus zone, no session running.
>
> Last thing I have a note on is from Monday evening: _"draft pitch deck v3,
> get to the financials slide before EOD."_ Want to pick that up, or start
> something else?

(Claude pulled "last thing I have a note on" by invoking
`weekly_rollup` on the cognitive-graph server. The substrate stored that
fact at the end of yesterday's session.)

---

## 08:35 — Start a session

**You:**

> Pick it up. Pitch deck — financials slide. Give me 45 minutes.

**Claude (invokes `mark_session_start`):**

```json
{
  "intent": "pitch deck v3 — financials slide",
  "duration_minutes": 45
}
```

**Claude:**

> Started. 45-minute interval, ending at 09:20. I'll nudge you at 30 if you
> haven't checked in.

---

## 09:11 — Check-in (you're deep in)

**You:**

> Almost done with the unit economics block. One more table.

**Claude:**

> Good. You're 36 minutes in — past the 30-mark already. Keep going if you're
> still flowing; I'll check again at the 45.

(No tool call needed here. Claude is just tracking against the active
session.)

---

## 09:25 — Past the end

**You:**

> Done. Got through unit economics and TAM. Skipped CAC payback for now.

**Claude (invokes `mark_session_end`):**

```json
{
  "session_id": "sess_2026-05-20T08:35Z",
  "summary": "pitch deck v3: finished unit economics + TAM. CAC payback deferred.",
  "outcome": "completed"
}
```

**Claude:**

> Logged. You ran 50 minutes — slightly over. You're approaching the
> hyperfocus-break threshold (your profile is set to 90). Want to take 10
> before the next thing, or push on?

---

## 09:26 — Take the break

**You:**

> Yeah, 10 min. What should I record so I don't lose the CAC thing?

**Claude (invokes `record_fact` on cognitive-graph):**

```json
{
  "subject": "pitch deck v3",
  "predicate": "open_thread",
  "object": "CAC payback table — needs the cohort data from June export",
  "confidence": 0.9
}
```

**Claude:**

> Recorded. When you come back to the deck I'll surface it. Go drink water.

---

## What just happened

Five tool calls across the cognitive-graph and chronometric servers,
triggered by ordinary conversation. No "magic". The substrate provided:

- **Continuity** — Monday's open thread surfaced on Tuesday morning
- **Time anchoring** — Claude knew the actual clock, the energy band, and how
  long the session had run
- **Lightweight memory** — a single `record_fact` call captured an open thread
  for next time without you having to remember to journal

The same loop works for any neurotype the profile is configured for. The
prompts shift (autistic-friendly skills emphasise predictable structure;
OCD-adjacent skills add rumination detection), but the substrate underneath
is the same.

## Things this transcript glosses over

- **First invocation latency.** Tool calls take ~200-500ms on a warm system.
  The model usually streams its prose while the tool runs, so it doesn't feel
  slow — but it isn't instant.
- **Tool-arg shaping.** Claude sometimes passes `duration_minutes: "45"`
  (string) instead of `45` (number). The schema rejects it and Claude retries.
  You'll see this in the tool-use panel.
- **The 30-minute nudge** in step 3 above is conversational, not a real
  timer. Real interval nudging lands when the chronometric server gets a
  scheduler in v0.0.3.
