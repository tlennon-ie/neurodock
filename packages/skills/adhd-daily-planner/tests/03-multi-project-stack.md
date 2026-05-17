# Test: 03 — Multi-project stack with elision

## Scenario

It is Monday, 2026-05-25, 08:30 local time. The user types `/resume monday`. Their profile sets `identity.neurotypes: ["adhd", "asd"]` (AuDHD), `preferences.output_format: "answer_first"`, `preferences.max_chunk_size: 5`, `chronometric.end_of_day_local: "18:30"`. The local cognitive graph has activity in the trailing seven days for **eight** projects. Each project has at least one decision; the most recent decision dates per project are:

| Project | Most recent decision date |
|---|---|
| neurodock | 2026-05-23 |
|  | 2026-05-22 |
| phase-0-rfc | 2026-05-22 |
| mcp-chronometric | 2026-05-21 |
| extension-browser | 2026-05-20 |
| eval-corpus | 2026-05-18 |
| docs-site | 2026-05-17 |
| plugin-marketplace | 2026-05-15 |

The skill must rank by `decided_on` recency, retain the top 5 (`neurodock`, ``, `phase-0-rfc`, `mcp-chronometric`, `extension-browser`), and elide the remaining 3 with a count — never naming them.

## Expected MCP tool sequence

1. `mcp-chronometric.get_time_context()` → `{day_of_week: "Monday", energy_zone: "morning_peak", ...}`
2. `mcp-cognitive-graph.weekly_rollup()` (unscoped) → returns all 8 projects' decisions in `decisions` array, ordered by `decided_on` descending.
3. `mcp-cognitive-graph.weekly_rollup(project="neurodock")` → rollup with `next_actions` populated.
4. `mcp-cognitive-graph.weekly_rollup(project="")` → rollup with `next_actions` populated.
5. `mcp-cognitive-graph.weekly_rollup(project="phase-0-rfc")` → rollup with `next_actions` populated.
6. `mcp-cognitive-graph.weekly_rollup(project="mcp-chronometric")` → rollup with `next_actions` populated.
7. `mcp-cognitive-graph.weekly_rollup(project="extension-browser")` → rollup with `next_actions` populated.
8. `mcp-task-fractionator.next_one(project="neurodock")` → confidence 0.91
9. `mcp-task-fractionator.next_one(project="")` → confidence 0.74
10. `mcp-task-fractionator.next_one(project="phase-0-rfc")` → confidence **0.62** (below the 0.7 threshold; must be flagged)
11. `mcp-task-fractionator.next_one(project="mcp-chronometric")` → confidence 0.85
12. `mcp-task-fractionator.next_one(project="extension-browser")` → error `NO_TASKS_AVAILABLE`

The skill MUST NOT call `weekly_rollup` or `next_one` for the three elided projects (`eval-corpus`, `docs-site`, `plugin-marketplace`).

## Expected response shape

- Opens with one paragraph. First sentence ≤ 80 characters, names "Monday" and the count of projects covered (5).
- Exactly five `### <Project name>` sections, in this order: `neurodock`, ``, `phase-0-rfc`, `mcp-chronometric`, `extension-browser`.
- `phase-0-rfc` section's `Next:` line explicitly contains the phrase `low confidence` and the numeric value `0.62`. The skill does NOT pretend the task is high-confidence.
- `extension-browser` section's `Next:` line states `no decomposed tasks for this project; consider decompose if it's time to plan it.` (per the SKILL.md contract) — no fabricated task.
- Closing block contains the line `Elided 3 further projects with activity this week.` (exact count). Does NOT name `eval-corpus`, `docs-site`, or `plugin-marketplace`.
- Closing block names `morning_peak` and `18:30` and the "not a productivity scorecard" sentence.
- Total response length ≤ 2600 characters.

## Pass criteria

- [ ] The tool sequence makes exactly one unscoped `weekly_rollup`, exactly five per-project `weekly_rollup` calls, and exactly five `next_one` calls.
- [ ] No tool call references `eval-corpus`, `docs-site`, or `plugin-marketplace`.
- [ ] Exactly five `### ` headings appear in the response.
- [ ] The five project names appear in the response in the order specified above (ranked by `decided_on` recency).
- [ ] The string `low confidence` appears in the `phase-0-rfc` section and the number `0.62` appears within 60 characters of it.
- [ ] The `extension-browser` section contains the substring `no decomposed tasks` and does NOT quote any task title.
- [ ] The closing block contains the exact substring `Elided 3 further projects`.
- [ ] None of these names appear in the response: `eval-corpus`, `docs-site`, `plugin-marketplace`.
- [ ] None of these substrings appear: `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`, `executive dysfunction`.
- [ ] No `!` anywhere in the response.
- [ ] Total response is ≤ 2600 characters.
