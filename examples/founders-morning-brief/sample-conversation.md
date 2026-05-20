# Sample conversation — founders' morning brief

A full end-to-end conversation showing the morning ritual on a realistic day-14 graph. Three projects, one with a low-confidence next action, one focus session marked. Plain markdown; no client-specific formatting.

The conversation is realistic on purpose. The third project's next action has low confidence. One project has no blocker. The brief surfaces all of this plainly — no rounding up, no editorialising.

---

## Profile in use

```yaml
# ~/.neurodock/profile.yaml (excerpt)
schema_version: "0.1.0"
identity:
  display_name: "M"
  neurotypes:
    - "adhd"
preferences:
  output_format: answer_first
  max_chunk_size: 5
  reading_font_hint: lexend
  motion: reduced
chronometric:
  hyperfocus_break_minutes: 75
  end_of_day_local: "18:00"
```

---

## Turn 1 — the morning prompt

**User:**

> Good morning. It is a new working day. Brief me on yesterday's open threads across my projects, suggest my top three priorities for today given my profile, and mark a focus session anchored to whichever priority I confirm first. Keep it short — answer-first, no pep.

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.get_time_context()`

```json
{}
```

`tool_result:`

```json
{
  "now": "2026-05-20T08:14:22+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT15H47M",
  "current_session_length": "PT0S",
  "energy_zone": "morning_peak",
  "end_of_day_local": "18:00"
}
```

`tool_use: mcp-cognitive-graph.weekly_rollup()`

```json
{}
```

`tool_result:`

```json
{
  "trailing_days": 7,
  "projects": [
    {
      "name": "product-v2",
      "last_decision_at": "2026-05-19T16:42:00+01:00",
      "decisions_count": 4,
      "blockers_count": 1
    },
    {
      "name": "customer-research",
      "last_decision_at": "2026-05-18T11:08:00+01:00",
      "decisions_count": 2,
      "blockers_count": 0
    },
    {
      "name": "ops-billing",
      "last_decision_at": "2026-05-17T14:30:00+01:00",
      "decisions_count": 1,
      "blockers_count": 1
    }
  ],
  "truncated": false
}
```

`tool_use: mcp-cognitive-graph.weekly_rollup(project="product-v2")`

```json
{ "project": "product-v2" }
```

`tool_result:`

```json
{
  "project": "product-v2",
  "decisions": [
    { "title": "ship the auth flow before the demo", "decided_on": "2026-05-19", "confidence": 0.85 }
  ],
  "blockers": [
    { "literal": "webhook signing key rotation not yet documented", "recorded_at": "2026-05-19T16:42:00+01:00" }
  ],
  "next_actions": [
    { "literal": "write the runbook entry for key rotation" }
  ]
}
```

`tool_use: mcp-cognitive-graph.weekly_rollup(project="customer-research")`

```json
{ "project": "customer-research" }
```

`tool_result:`

```json
{
  "project": "customer-research",
  "decisions": [
    { "title": "interview pool capped at 8 for this cycle", "decided_on": "2026-05-18", "confidence": 0.91 }
  ],
  "blockers": [],
  "next_actions": [
    { "literal": "send follow-up to the three remaining unconfirmed interviewees" }
  ]
}
```

`tool_use: mcp-cognitive-graph.weekly_rollup(project="ops-billing")`

```json
{ "project": "ops-billing" }
```

`tool_result:`

```json
{
  "project": "ops-billing",
  "decisions": [
    { "title": "switch to net-30 for the two enterprise pilots", "decided_on": "2026-05-17", "confidence": 0.79 }
  ],
  "blockers": [
    { "literal": "invoicing template needs the new entity name", "recorded_at": "2026-05-17T14:30:00+01:00" }
  ],
  "next_actions": []
}
```

`tool_use: neurodock-mcp-task-fractionator.next_one(project="product-v2")`

```json
{ "project": "product-v2" }
```

`tool_result:`

```json
{
  "task": {
    "title": "write the runbook entry for key rotation",
    "estimated_minutes": 35,
    "acceptance_criteria": [
      "Runbook page covers detection, rollback, and the verification step.",
      "Linked from the auth-flow doc."
    ]
  },
  "confidence": 0.78,
  "rationale": "Selected by lowest-sequence task with all dependencies satisfied; tag set matches the open blocker."
}
```

`tool_use: neurodock-mcp-task-fractionator.next_one(project="customer-research")`

```json
{ "project": "customer-research" }
```

`tool_result:`

```json
{
  "task": {
    "title": "send follow-up to the three remaining unconfirmed interviewees",
    "estimated_minutes": 15,
    "acceptance_criteria": [
      "Three messages sent, each personalised to the prior thread."
    ]
  },
  "confidence": 0.82,
  "rationale": "No blockers on this project; next_action verbatim from weekly_rollup."
}
```

`tool_use: neurodock-mcp-task-fractionator.next_one(project="ops-billing")`

```json
{ "project": "ops-billing" }
```

`tool_result:`

```json
{
  "task": {
    "title": "update the invoicing template",
    "estimated_minutes": 20,
    "acceptance_criteria": [
      "Template reflects the new entity name on header and footer.",
      "One test invoice generated and visually verified."
    ]
  },
  "confidence": 0.45,
  "rationale": "Multiple candidate tasks tied on sequence; tie broken by tag overlap with the open blocker. Confidence low because the project has only one decision in the trailing window."
}
```

**Assistant response:**

> Wednesday morning. Three projects with activity this week. Energy zone: morning_peak.
>
> ### product-v2
> - Most recent decision: ship the auth flow before the demo (2026-05-19, conf 0.85)
> - Blocker: webhook signing key rotation not yet documented
> - Next: write the runbook entry for key rotation (35 min, conf 0.78)
>
> ### customer-research
> - Most recent decision: interview pool capped at 8 for this cycle (2026-05-18, conf 0.91)
> - Blocker: none
> - Next: send follow-up to the three remaining unconfirmed interviewees (15 min, conf 0.82)
>
> ### ops-billing
> - Most recent decision: switch to net-30 for the two enterprise pilots (2026-05-17, conf 0.79)
> - Blocker: invoicing template needs the new entity name
> - Next: update the invoicing template (20 min, low confidence 0.45)
>
> ---
> Energy zone right now: morning_peak. End-of-day stated as 18:00.
> This brief is not a productivity scorecard. Yesterday's incomplete items are not graded.
>
> Which one do you want to start with? I'll mark the session.

---

## Turn 2 — confirming the focus session

**User:**

> The runbook one. Let's start there.

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.mark_session_start({"intent": "write the runbook entry for key rotation"})`

```json
{ "intent": "write the runbook entry for key rotation" }
```

`tool_result:`

```json
{
  "session_id": "5e8a1c92-3d4b-4f6c-8a7e-1b2c3d4e5f60",
  "started_at": "2026-05-20T08:15:48+01:00",
  "intent": "write the runbook entry for key rotation",
  "auto_closed_prior_session": null
}
```

**Assistant response:**

> Session running. Intent: "write the runbook entry for key rotation". I'll surface a break suggestion at 75 minutes. Say "done" when you finish or "where am I" any time to check.

---

## Turn 3 — later in the morning, mid-session check

(~50 minutes have passed; the user steps back to look something up.)

**User:**

> where am I

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.get_time_context()`

```json
{}
```

`tool_result:`

```json
{
  "now": "2026-05-20T09:08:14+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT52M26S",
  "current_session_length": "PT52M26S",
  "energy_zone": "morning_peak"
}
```

The session length (52 minutes) is below the 75-minute `hyperfocus_break_minutes` threshold from the profile, so no break is surfaced. The assistant answers the literal question and stops.

**Assistant response:**

> 52 minutes in. Intent: "write the runbook entry for key rotation".

---

## Turn 4 — break trigger after the threshold is crossed

(Another 30 minutes pass; the user prompts again.)

**User:**

> I'm at a stopping point on the runbook. Status?

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.get_time_context()`

```json
{}
```

`tool_result:`

```json
{
  "now": "2026-05-20T09:38:50+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT30M36S",
  "current_session_length": "PT1H23M2S",
  "energy_zone": "morning_peak"
}
```

`current_session_length` is now 83 minutes — past the 75-minute threshold. The assistant calls `request_break_if_needed`.

`tool_use: mcp-chronometric.request_break_if_needed({"threshold_minutes": 75})`

```json
{ "threshold_minutes": 75 }
```

`tool_result:`

```json
{
  "elapsed": "PT1H23M2S",
  "prior_intent": "write the runbook entry for key rotation",
  "suggested_action": "stand_and_stretch",
  "threshold_minutes": 75
}
```

**Assistant response:**

> 83 minutes in. Stated intent: "write the runbook entry for key rotation". Suggested next: stand_and_stretch. Say "done" to close the session or "another" to start the next block.

---

## Turn 5 — closing the session and recording the decision

**User:**

> done. The runbook is up — covers detection, rollback, and verification. I'll record the decision.

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.mark_session_end({"summary": "runbook for key rotation completed; covers detection, rollback, verification"})`

```json
{ "summary": "runbook for key rotation completed; covers detection, rollback, verification" }
```

`tool_result:`

```json
{
  "session_id": "5e8a1c92-3d4b-4f6c-8a7e-1b2c3d4e5f60",
  "started_at": "2026-05-20T08:15:48+01:00",
  "ended_at": "2026-05-20T09:39:11+01:00",
  "duration": "PT1H23M23S",
  "intent": "write the runbook entry for key rotation",
  "summary": "runbook for key rotation completed; covers detection, rollback, verification"
}
```

`tool_use: mcp-cognitive-graph.record_fact({"subject": {"type": "project", "name": "product-v2"}, "predicate": "decided_in", "object": {"literal": "key-rotation runbook published; documents detection, rollback, verification"}, "source": "session 5e8a1c92"})`

```json
{
  "subject": { "type": "project", "name": "product-v2" },
  "predicate": "decided_in",
  "object": { "literal": "key-rotation runbook published; documents detection, rollback, verification" },
  "source": "session 5e8a1c92"
}
```

`tool_result:`

```json
{
  "fact_id": "8c9d0e1f-2a3b-4c5d-9e8f-7a6b5c4d3e2f",
  "recorded_at": "2026-05-20T09:39:14+01:00",
  "subject": { "type": "project", "id": "p-product-v2", "name": "product-v2" },
  "predicate": "decided_in",
  "object": { "literal": "key-rotation runbook published; documents detection, rollback, verification" },
  "source": "session 5e8a1c92",
  "deduplicated": false
}
```

**Assistant response:**

> Session closed. Duration: 1 hour 23 minutes 23 seconds. Decision recorded against product-v2.

---

## What just happened

Over five turns, the morning ritual did the following:

1. **Anchored the day** — checked the time, day of week, and energy zone.
2. **Pulled context** — surfaced three projects with activity in the last 7 days, with one decision and one blocker per project.
3. **Surfaced one next action per project** — three tasks, one explicitly flagged as low-confidence.
4. **Marked a focus session** — anchored to the user-chosen priority, started running.
5. **Held the session without nagging** — one mid-session status check at 52 minutes returned just the data, no editorial.
6. **Surfaced a break suggestion past the profile's threshold** — at 83 minutes (past the 75-minute `hyperfocus_break_minutes`), one line, once.
7. **Closed cleanly** — duration on record, summary captured.
8. **Recorded the decision in the graph** — so tomorrow's morning brief will surface it as a recent decision under product-v2, the blocker will (next time the graph is updated by the user) be marked resolved, and the next-action surfaced for product-v2 will rotate to the next pending item.

No remote calls. No telemetry. Five turns. About five minutes of the user's actual attention (the rest of the time was inside the focus session, where the assistant stayed out of the way).

Tomorrow's brief draws on what today recorded. That is the whole loop.
