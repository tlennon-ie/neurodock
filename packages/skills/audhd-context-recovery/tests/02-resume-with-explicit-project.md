# Test 02 — resume with an explicitly named project (alias resolution)

## Scenario

The user types:

```
/resume Phase 0 RFC
```

"Phase 0 RFC" is a known alias for an entity also called "Phase 0 RFC". Resolution returns method `alias` with score `0.92` — high but not exact. The skill must surface the resolution to the user and confirm before producing the recap.

## Fixture state

**Chronometric:**

- `time_since_last_prompt`: `PT2H10M` (same-day gap; the user named the project so the time scope is mostly informational).

**Cognitive graph:**

- `recall_entity({ name_or_alias: "Phase 0 RFC" })` returns:
  - `entity.id`: `ent_01HZPHASE0RFC`
  - `entity.type`: `project`
  - `entity.name`: `Phase 0 RFC`
  - `entity.aliases`: `["P0 RFC", "Phase 0 RFC"]`
  - `resolution.method`: `alias`
  - `resolution.score`: `0.92`
- `recall_decisions({ project: "Phase 0 RFC", since: <7 days ago> })` returns three decisions.
- `weekly_rollup({ project: "Phase 0 RFC" })` returns one blocker and two `next_actions`.

## Expected MCP tool sequence

1. `get_time_context()`.
2. `recall_entity({ name_or_alias: "Phase 0 RFC" })`.
3. The skill MUST pause and surface the resolution to the user. No further MCP calls until the user confirms.
4. After user confirms: `recall_decisions({ project: "Phase 0 RFC", since: "<date 6–7 days before now>" })`.
5. `weekly_rollup({ project: "Phase 0 RFC" })`.

## Expected response shape

**Phase 1 — confirmation prompt.** Before producing the recap, the skill emits a confirmation line:

- MUST mention the resolved entity name (`Phase 0 RFC`).
- MUST mention the resolution method (`alias`) AND the score (`0.92`).
- MUST ask the user to confirm (yes/no, or equivalent).
- MUST NOT proceed to the three-section recap in the same turn.

**Phase 2 — recap (after confirmation).** Same three-section structure as test 01:

1. Project line.
2. Recent decisions (≤ 3).
3. Open threads (≤ 3).
4. Closing "Next:" sentence drawn from `weekly_rollup.next_actions`.

## Pass criteria

- [ ] `recall_entity` was called with `name_or_alias = "Phase 0 RFC"`.
- [ ] In the first turn, the skill output contains the literal string `0.92` (or `92%`) AND the word `alias`.
- [ ] In the first turn, the skill output contains an explicit ask for confirmation (e.g. a question mark plus the word `confirm`, `right`, `correct`, or `continue`).
- [ ] `recall_decisions` and the second `weekly_rollup` are NOT called in the first turn.
- [ ] On a simulated "yes" reply, `recall_decisions` and `weekly_rollup({ project: "Phase 0 RFC" })` ARE called.
- [ ] The Phase 2 recap follows the same three-section + closing-sentence structure as test 01.
- [ ] Output does NOT silently assume the match; the score and method MUST be visible.
