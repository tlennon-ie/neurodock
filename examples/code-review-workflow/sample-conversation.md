# Sample conversation — code-review workflow

A full end-to-end conversation showing the 90-minute PR review block on a realistic mid-week afternoon. The graph has two weeks of warm-up on the `billing-service` repo. The PR touches three files; one of them has a prior comment from six weeks ago that is still applicable. One mid-block break is triggered at the 75-minute threshold. The review ends with a "Don't merge" verdict, four substantive comments, and a `record_fact` against the project.

The conversation is realistic on purpose. The third file has no graph history (it's a new test file). One of the comments the user drafts gets reshaped from a long rambling sentence into the Tier-B verdict-first form. The substrate stays out of the way once the session is running.

---

## Profile in use

```yaml
# ~/.neurodock/profile.yaml (excerpt)
schema_version: "0.1.0"
identity:
  display_name: "R"
  neurotypes:
    - "adhd"
preferences:
  output_format: answer_first
  max_chunk_size: 5
  reading_font_hint: lexend
  motion: reduced
chronometric:
  hyperfocus_break_minutes: 75
  session_overlap_policy: auto_close
  end_of_day_local: "18:00"
```

---

## Turn 1 — opening the review block

**User:**

> I'm starting a 90-minute review block on PR https://github.com/acme/billing-service/pull/482. The files changed are: `app/billing/invoicing.py`, `app/billing/handlers.py`, `tests/test_invoicing.py`. Recall any prior comments I left on those files and any prior decisions on the billing-service project that might be relevant. Mark a session with intent "review PR #482". Then walk through the PR with me — shape every review comment I draft verdict-first.

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.mark_session_start({"intent": "review PR #482"})`

```json
{ "intent": "review PR #482" }
```

`tool_result:`

```json
{
  "session_id": "a91b4e7c-6f3d-4b8c-9d2a-7e1f0b3c4d52",
  "started_at": "2026-05-20T13:32:08+01:00",
  "intent": "review PR #482",
  "auto_closed_prior_session": null
}
```

`tool_use: mcp-cognitive-graph.recall_entity({"type": "file", "name": "app/billing/invoicing.py", "project": "billing-service"})`

```json
{
  "type": "file",
  "name": "app/billing/invoicing.py",
  "project": "billing-service"
}
```

`tool_result:`

```json
{
  "entity": {
    "type": "file",
    "name": "app/billing/invoicing.py",
    "project": "billing-service"
  },
  "facts": [
    {
      "fact_id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "predicate": "reviewed_in",
      "object": {
        "literal": "PR #441; comment: \"Don't merge: this invoice-total mutation isn't covered by the existing property tests. Add property test before merging.\""
      },
      "recorded_at": "2026-04-08T15:22:00+01:00",
      "source": "session 7c4f8a13-…"
    },
    {
      "fact_id": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      "predicate": "comment_resolution",
      "object": {
        "literal": "PR #441 comment addressed; reviewer approved 2026-04-09."
      },
      "recorded_at": "2026-04-09T11:05:00+01:00",
      "source": "session 7c4f8a13-…"
    }
  ]
}
```

`tool_use: mcp-cognitive-graph.recall_entity({"type": "file", "name": "app/billing/handlers.py", "project": "billing-service"})`

```json
{
  "type": "file",
  "name": "app/billing/handlers.py",
  "project": "billing-service"
}
```

`tool_result:`

```json
{
  "entity": {
    "type": "file",
    "name": "app/billing/handlers.py",
    "project": "billing-service"
  },
  "facts": [
    {
      "fact_id": "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      "predicate": "touched_in",
      "object": { "literal": "PR #441 (no comments left)" },
      "recorded_at": "2026-04-08T15:22:00+01:00",
      "source": "session 7c4f8a13-…"
    }
  ]
}
```

`tool_use: mcp-cognitive-graph.recall_entity({"type": "file", "name": "tests/test_invoicing.py", "project": "billing-service"})`

```json
{
  "type": "file",
  "name": "tests/test_invoicing.py",
  "project": "billing-service"
}
```

`tool_result:`

```json
{
  "entity": null,
  "facts": []
}
```

`tool_use: mcp-cognitive-graph.recall_decisions({"project": "billing-service", "limit": 3})`

```json
{ "project": "billing-service", "limit": 3 }
```

`tool_result:`

```json
{
  "project": "billing-service",
  "decisions": [
    {
      "title": "invoice totals are immutable once issued — corrections go through a credit-note flow, never mutation",
      "decided_on": "2026-05-12",
      "confidence": 0.91
    },
    {
      "title": "all monetary code paths must have property-based tests, not unit asserts alone",
      "decided_on": "2026-04-30",
      "confidence": 0.86
    },
    {
      "title": "net-30 for enterprise pilots; standard customers stay on net-7",
      "decided_on": "2026-05-17",
      "confidence": 0.79
    }
  ]
}
```

**Assistant response:**

> Session marked. Intent: "review PR #482". Started 13:32. Break nudge at 75 min.
>
> ### Prior context
>
> **app/billing/invoicing.py** — 1 prior comment from PR #441 (6 weeks ago):
>
> > _"Don't merge: this invoice-total mutation isn't covered by the existing property tests. Add property test before merging."_
>
> Status: addressed in PR #441; you approved 2026-04-09. Surfacing because the file is touched again and decision (2026-05-12) below means total-mutation is now categorically wrong.
>
> **app/billing/handlers.py** — touched in PR #441 but you left no comments then. No prior comments to surface.
>
> **tests/test_invoicing.py** — new to your graph. No prior context.
>
> ### Recent decisions on billing-service (top 3)
>
> 1. **2026-05-12** — _"invoice totals are immutable once issued — corrections go through a credit-note flow, never mutation"_ (conf 0.91)
> 2. **2026-04-30** — _"all monetary code paths must have property-based tests, not unit asserts alone"_ (conf 0.86)
> 3. **2026-05-17** — _"net-30 for enterprise pilots; standard customers stay on net-7"_ (conf 0.79)
>
> ---
>
> Open PR #482 in your browser. Start with `app/billing/invoicing.py` — the prior comment + decision #1 + decision #2 all converge on what you'll see there. Draft your comments here as you go; I'll shape them verdict-first.

---

## Turn 2 — drafting a comment that gets reshaped

(~25 minutes pass. The user has read `app/billing/invoicing.py` and the relevant test file. They type a rough comment.)

**User:**

> Comment on invoicing.py line 142. I think this introduces the exact same issue as PR #441 because the new `recompute_total()` method directly mutates `invoice.total`, and we just decided last week that totals are immutable post-issue and corrections go via credit-note, so this whole method shouldn't exist. Also it has no property test coverage which is the other decision we made. And the unit test in the new test file only checks one happy path.

**Assistant (tool calls and response):**

The assistant calls `get_time_context` to determine the formatter tier. Session length is 25 min — below the 75-min threshold — but the original prompt contains "review" and "walk through", which forces Tier B regardless.

`tool_use: mcp-chronometric.get_time_context()`

```json
{}
```

`tool_result:`

```json
{
  "now": "2026-05-20T13:57:41+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT25M33S",
  "current_session_length": "PT25M33S",
  "energy_zone": "afternoon_steady"
}
```

The hyperfocus-formatter is in Tier B (design-critique phrase override). Verdict on line 1, up to `max_chunk_size: 5` bullets.

**Assistant response:**

> ```
> Don't merge: recompute_total() mutates invoice.total, which decision
> 2026-05-12 categorically forbids.
>
> - Decision (2026-05-12, conf 0.91): invoice totals immutable post-issue;
>   corrections via credit-note, never mutation. This method violates that
>   contract.
> - Prior history on this file: PR #441 had the same issue (mutation of
>   invoice total) and was blocked on it. The fix landed; this PR
>   re-introduces the pattern.
> - Decision (2026-04-30, conf 0.86): monetary paths require property-based
>   tests. New code has unit test only — happy path, no invariants.
> - Mechanism: if a total needs correction post-issue, the credit-note flow
>   in app/billing/credit_notes.py is the supported path.
> - Action: remove recompute_total(); route corrections via credit_notes.
>   If there is a genuine new requirement I'm missing, surface it as an ADR
>   first.
> ```
>
> Paste that into GitHub as the review comment on line 142. Say "next" when you're ready to move on, or "record decision: <text>" if anything you've worked out here should be persisted to the graph.

---

## Turn 3 — mid-block break trigger

(50 more minutes pass. The user has finished `invoicing.py` (3 comments), worked through `handlers.py` (1 comment), and is partway through `tests/test_invoicing.py`. They prompt for status.)

**User:**

> Status. Where am I.

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.get_time_context()`

```json
{}
```

`tool_result:`

```json
{
  "now": "2026-05-20T14:51:18+01:00",
  "day_of_week": "Wednesday",
  "time_since_last_prompt": "PT47M12S",
  "current_session_length": "PT1H19M10S",
  "energy_zone": "afternoon_steady"
}
```

`current_session_length` is 79 minutes — past the 75-minute `hyperfocus_break_minutes` threshold. The formatter calls `request_break_if_needed`.

`tool_use: mcp-chronometric.request_break_if_needed({"threshold_minutes": 75})`

```json
{ "threshold_minutes": 75 }
```

`tool_result:`

```json
{
  "elapsed": "PT1H19M10S",
  "prior_intent": "review PR #482",
  "suggested_action": "stand_and_stretch",
  "threshold_minutes": 75
}
```

**Assistant response:**

> Session length: 79 minutes. You set the threshold at 75. Your stated intent: "review PR #482". Suggested next action: stand_and_stretch.
>
> ```
> You're 79 min in. 4 substantive comments left so far.
>
> - app/billing/invoicing.py — 3 comments (1 blocking on the mutation issue;
>   2 nits on naming/docstrings).
> - app/billing/handlers.py — 1 comment (logging level too noisy on the
>   billing-error path).
> - tests/test_invoicing.py — partway through; no comments yet.
> - Remaining: finish test file (~15 min if you stay focused).
> - Verdict so far: Don't merge — the recompute_total() issue alone is
>   blocking.
> ```
>
> Break, or push through? Either is fine. Say "break" to pause the session timer or "continue" to keep going.

---

## Turn 4 — pushing through and finishing the test file

**User:**

> continue. I'll wrap up the test file then close out.

(~15 minutes pass. The user finishes reading the test file, leaves no additional comments, and returns.)

**User:**

> done. Test file is fine — coverage is thin but not blocking, I noted it inline as a nit. Verdict on the PR: don't merge, the recompute_total() issue is fundamental. 4 substantive comments total. Close the session and record it.

**Assistant (tool calls and response):**

`tool_use: mcp-chronometric.mark_session_end({"summary": "PR #482 reviewed: don't merge; 4 substantive comments (1 blocking on recompute_total() mutating invoice.total, 3 nits); test coverage thin but not blocking"})`

```json
{
  "summary": "PR #482 reviewed: don't merge; 4 substantive comments (1 blocking on recompute_total() mutating invoice.total, 3 nits); test coverage thin but not blocking"
}
```

`tool_result:`

```json
{
  "session_id": "a91b4e7c-6f3d-4b8c-9d2a-7e1f0b3c4d52",
  "started_at": "2026-05-20T13:32:08+01:00",
  "ended_at": "2026-05-20T15:08:42+01:00",
  "duration": "PT1H36M34S",
  "intent": "review PR #482",
  "summary": "PR #482 reviewed: don't merge; 4 substantive comments (1 blocking on recompute_total() mutating invoice.total, 3 nits); test coverage thin but not blocking"
}
```

`tool_use: mcp-cognitive-graph.record_fact({"subject": {"type": "project", "name": "billing-service"}, "predicate": "reviewed_in", "object": {"literal": "PR #482: don't merge — recompute_total() mutates invoice.total, violates 2026-05-12 immutability decision; 4 substantive comments; reviewer R."}, "source": "session a91b4e7c"})`

```json
{
  "subject": { "type": "project", "name": "billing-service" },
  "predicate": "reviewed_in",
  "object": {
    "literal": "PR #482: don't merge — recompute_total() mutates invoice.total, violates 2026-05-12 immutability decision; 4 substantive comments; reviewer R."
  },
  "source": "session a91b4e7c"
}
```

`tool_result:`

```json
{
  "fact_id": "9f8e7d6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f",
  "recorded_at": "2026-05-20T15:08:45+01:00",
  "subject": {
    "type": "project",
    "id": "p-billing-service",
    "name": "billing-service"
  },
  "predicate": "reviewed_in",
  "object": {
    "literal": "PR #482: don't merge — recompute_total() mutates invoice.total, violates 2026-05-12 immutability decision; 4 substantive comments; reviewer R."
  },
  "source": "session a91b4e7c",
  "deduplicated": false
}
```

`tool_use: mcp-cognitive-graph.record_fact({"subject": {"type": "file", "name": "app/billing/invoicing.py", "project": "billing-service"}, "predicate": "reviewed_in", "object": {"literal": "PR #482; comment: \"Don't merge: recompute_total() mutates invoice.total, which decision 2026-05-12 categorically forbids.\""}, "source": "session a91b4e7c"})`

```json
{
  "subject": {
    "type": "file",
    "name": "app/billing/invoicing.py",
    "project": "billing-service"
  },
  "predicate": "reviewed_in",
  "object": {
    "literal": "PR #482; comment: \"Don't merge: recompute_total() mutates invoice.total, which decision 2026-05-12 categorically forbids.\""
  },
  "source": "session a91b4e7c"
}
```

`tool_result:`

```json
{
  "fact_id": "8e7d6c5b-4a3c-2d1e-0f9a-8b7c6d5e4f3a",
  "recorded_at": "2026-05-20T15:08:46+01:00",
  "subject": {
    "type": "file",
    "id": "f-billing-service-app-billing-invoicing-py",
    "name": "app/billing/invoicing.py",
    "project": "billing-service"
  },
  "predicate": "reviewed_in",
  "object": {
    "literal": "PR #482; comment: \"Don't merge: recompute_total() mutates invoice.total, which decision 2026-05-12 categorically forbids.\""
  },
  "source": "session a91b4e7c",
  "deduplicated": false
}
```

**Assistant response:**

> Session closed. Duration: 1 hour 36 minutes 34 seconds. PR verdict and file-level comment both recorded against billing-service.
>
> The next review you do that touches `app/billing/invoicing.py` will surface today's "Don't merge" comment alongside the older PR #441 one, so future-you can see the pattern.

---

## What just happened

Over four turns and ~96 minutes of wall-clock, the review block did the following:

1. **Anchored the session** — marked a session with explicit intent. The session timer is what eventually triggers the break nudge.
2. **Surfaced prior context per file** — one file had a still-applicable prior comment (already addressed in an earlier PR, but the same pattern re-appears in this one); one file had history but no comments; one file had no graph history at all. The substrate said all three plainly.
3. **Surfaced project-level decisions** — three recent decisions, two of which were directly relevant to the blocking comment.
4. **Reshaped a rough comment into verdict-first form** — the user typed a 70-word rambling sentence; the formatter returned a verdict line plus five bullets. The user pasted that into GitHub.
5. **Triggered one break nudge at 79 minutes** — one line, once, past the user's own 75-minute threshold. Did not block. Did not repeat.
6. **Closed cleanly** — session duration recorded, PR-level verdict recorded against the project, file-level comment recorded against the file. Future reviews touching the same file will see today's verdict.

No remote calls. No telemetry. Four user turns. About 96 minutes of the user's actual attention — most of it inside the review reading the code, with the assistant staying out of the way between turns.

Tomorrow's review of a different PR on the same project will surface decision #1 (the immutability rule) plus today's PR #482 verdict if that PR touches any of the same files. That is the whole loop.
