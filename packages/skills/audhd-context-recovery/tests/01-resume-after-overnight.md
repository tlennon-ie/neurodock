# Test 01 — resume after overnight

## Scenario

The user opens a fresh session at 09:14 local time on Friday 2026-05-15. The previous prompt was at 19:30 the night before — a gap of about 14 hours. The user types:

```
/resume
```

No project named. The most recently active project in the graph is `neurodock`.

## Fixture state

**Chronometric:**

- `now`: `2026-05-15T09:14:22+01:00`
- `day_of_week`: `Friday`
- `time_since_last_prompt`: `PT13H44M`
- `current_session_length`: `PT0S`
- `energy_zone`: `morning_peak`

**Cognitive graph:**

- Project entity `neurodock` exists. Last activity 2026-05-14T16:42:00+01:00.
- `weekly_rollup()` (unscoped) returns a summary naming `neurodock` as the project with most activity in the period 2026-05-09 → 2026-05-15.
- `recall_decisions(project="neurodock", since="2026-05-08")` returns two decisions, dated 2026-05-14 and 2026-05-12.
- `weekly_rollup(project="neurodock")` returns one open blocker ("awaiting confirmation for Phase 1 launch") and one candidate next action drawn from `next_actions`.

## Expected MCP tool sequence

1. `get_time_context()` — reads the clock.
2. `weekly_rollup()` — no project arg; used to discover the most recent project because the user did not name one.
3. `recall_decisions({ project: "neurodock", since: "2026-05-08" })` — 7-day window because gap is ≤ 24h.
4. `weekly_rollup({ project: "neurodock" })` — to pull blockers and next_actions.

`recall_entity` MAY be called instead of step 2 if the skill resolves the project a different way, but the project name MUST be drawn from graph state, not invented.

## Expected response shape

Three sections, in this order:

1. **Project line.** One line. Contains the project name `neurodock` and a relative-time pointer to last activity (e.g. "yesterday 16:42" or "2026-05-14 16:42").
2. **Recent decisions.** Bulleted list. Maximum 3 items. Each item one line, each containing a decision name and a date.
3. **Open threads.** Bulleted list. Maximum 3 items. MUST include the blocker about "awaiting confirmation".
4. **Closing sentence.** One concrete next move, drawn from `weekly_rollup.next_actions`. MUST NOT be a generic suggestion not present in the graph.

## Pass criteria

- [ ] All four MCP calls listed above were made (or the documented alternative for step 2).
- [ ] `since` in `recall_decisions` is 6 or 7 days before `now` (overnight gap → 7-day window).
- [ ] Output contains the project name `neurodock`.
- [ ] Output contains a date or relative-time reference to 2026-05-14.
- [ ] Output contains the blocker text "awaiting confirmation" (exact phrase from the fixture).
- [ ] Output does NOT contain "welcome back", "great to see you", "you've been gone", or any greeting-warmth phrase.
- [ ] Output does NOT contain "executive function", "context switching", or any clinical framing.
- [ ] Output does NOT contain facts absent from the fixture graph.
- [ ] Closing "Next:" sentence quotes or paraphrases an item from `weekly_rollup.next_actions`.
