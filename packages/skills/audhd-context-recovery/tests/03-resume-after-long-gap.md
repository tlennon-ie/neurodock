# Test 03 — resume after a long gap

## Scenario

The user opens a session after 12 days away. They type:

```
/resume
```

The graph has a clear most-recent project. The skill must widen its `since` window to cover the gap, must explicitly acknowledge that the gap is long, and must NOT pretend the user was "just here yesterday". The skill MUST NOT moralise the gap or perform warmth.

## Fixture state

**Chronometric:**

- `now`: `2026-05-15T10:00:00+01:00`
- `time_since_last_prompt`: `P12D` (12 days).
- `energy_zone`: `morning_peak`.

**Cognitive graph:**

- Project entity `neurodock` is the most recently active project. Last activity 2026-05-03.
- `weekly_rollup()` (unscoped) returns `neurodock` as the most active project in the trailing 7-day window — but the 7-day window mostly contains older activity because of the gap.
- `recall_decisions({ project: "neurodock", since: "2026-04-15" })` returns four decisions in the 30 days prior to 2026-05-15. The newest is dated 2026-05-03.
- `weekly_rollup({ project: "neurodock" })` returns one blocker recorded 2026-05-02 and zero `next_actions` (the gap is long enough that automated next-actions have aged out).

## Expected MCP tool sequence

1. `get_time_context()` — returns `time_since_last_prompt = P12D`.
2. `weekly_rollup()` — unscoped, to identify the most recent project.
3. `recall_decisions({ project: "neurodock", since: "<30 days before now>" })` — window MUST be ≥ 14 days (per SKILL.md step 1; this scenario hits the > 7-day branch which scopes to 30 days).
4. `weekly_rollup({ project: "neurodock" })` — for blockers / next_actions.

## Expected response shape

1. **Project line.** Contains `neurodock` and a date or relative reference to the last activity (2026-05-03). The relative reference MUST NOT be "yesterday" or "this morning" — it must be honest about the 12-day gap (e.g. "last touched 2026-05-03", or "12 days ago").
2. **Recent decisions.** Up to three, dated.
3. **Open threads.** Up to three. Contains the blocker recorded 2026-05-02.
4. **Closing sentence.** Because `next_actions` is empty in the fixture, the skill MUST NOT invent one. It MUST say something equivalent to "Nothing in the graph suggests an obvious next move — your call." or surface that no next action is queued.

## Pass criteria

- [ ] All four MCP calls listed above were made.
- [ ] In the `recall_decisions` call, `since` is between 14 and 31 days before `now` (i.e. ≥ 14 days, ≤ 31 days). The 7-day default is NOT acceptable.
- [ ] Output contains the project name `neurodock`.
- [ ] Output references the last activity date as 2026-05-03, OR uses the phrasing "12 days ago" or "almost two weeks", OR equivalent honest acknowledgement of the gap.
- [ ] Output does NOT contain "yesterday", "this morning", "just now", or any phrase implying continuity.
- [ ] Output does NOT contain "welcome back", "missed you", "good to have you back", or any greeting-warmth phrase.
- [ ] Output does NOT comment on the user's absence in a judgemental or sympathetic register (no "I see it's been a while — that's okay!", no "long break, hope you rested").
- [ ] Closing "Next:" sentence does NOT invent a task. It MUST be the honest "nothing suggested" form when `next_actions` is empty.
