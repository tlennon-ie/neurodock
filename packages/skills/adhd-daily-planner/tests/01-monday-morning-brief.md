# Test: 01 — Monday morning brief, happy path

## Scenario

It is Monday, 2026-05-18, 08:42 local time. The user invokes the skill by typing `/resume monday` as their first message of the local day. Their profile sets `identity.neurotypes: ["adhd"]`, `preferences.output_format: "answer_first"`, `preferences.max_chunk_size: 5`, and `chronometric.end_of_day_local: "18:30"`. The local cognitive graph contains activity in the trailing seven days for exactly three projects: `neurodock`, `kipi-system`, and `phase-0-rfc`. Each project has at least one recent decision; `neurodock` has one open blocker; `kipi-system` has two recent decisions and an empty `next_actions` field; `phase-0-rfc` has one decision and one suggested next-action. The task fractionator returns high-confidence pending tasks for all three projects.

## Expected MCP tool sequence

1. `mcp-chronometric.get_time_context()` →
   ```json
   {
     "now": "2026-05-18T08:42:11+01:00",
     "day_of_week": "Monday",
     "time_since_last_prompt": "PT0S",
     "current_session_length": "PT0S",
     "energy_zone": "morning_peak"
   }
   ```
2. `mcp-cognitive-graph.weekly_rollup()` (unscoped, to discover projects) →
   ```json
   {
     "project": null,
     "period": {"start": "2026-05-11", "end": "2026-05-18"},
     "summary": "This week across all projects: 4 decisions recorded, 1 blocker noted, 3 candidate next actions.",
     "decisions": [
       {"id": "ent_D1", "name": "Ship rumination detector first", "decided_on": "2026-05-16", "decided_by": [], "confidence": 1.0},
       {"id": "ent_D2", "name": "Adopt sqlite-vec 0.2", "decided_on": "2026-05-15", "decided_by": [], "confidence": 1.0},
       {"id": "ent_D3", "name": "Defer guardrail field study to month 6", "decided_on": "2026-05-14", "decided_by": [], "confidence": 1.0},
       {"id": "ent_D4", "name": "Founding scope locked to three pillars", "decided_on": "2026-05-12", "decided_by": [], "confidence": 1.0}
     ],
     "blockers": [
       {"id": "fact_B1", "subject": {"type": "project", "name": "neurodock"}, "predicate": "blocked_by", "object": {"literal": "awaiting clinical advisor confirmation"}, "confidence": 0.9, "recorded_at": "2026-05-15T11:20:00+01:00"}
     ],
     "next_actions": ["Resolve blocker on neurodock", "Follow up on decision 'Adopt sqlite-vec 0.2' with implementation owner", "Draft RFC section 4"]
   }
   ```
3. `mcp-cognitive-graph.weekly_rollup(project="neurodock")` → decisions=[ent_D1, ent_D3], blockers=[fact_B1], next_actions=["Resolve blocker on neurodock: 'awaiting clinical advisor confirmation'"]
4. `mcp-cognitive-graph.weekly_rollup(project="kipi-system")` → decisions=[ent_D2], blockers=[], next_actions=[] (empty)
5. `mcp-cognitive-graph.recall_decisions(project="kipi-system", since="2026-04-18")` → returns the two most recent decisions on kipi-system (because step 4 returned empty next_actions)
6. `mcp-cognitive-graph.weekly_rollup(project="phase-0-rfc")` → decisions=[ent_D4], blockers=[], next_actions=["Draft RFC section 4"]
7. `mcp-task-fractionator.next_one(project="neurodock")` → task with confidence 0.92
8. `mcp-task-fractionator.next_one(project="kipi-system")` → task with confidence 0.81
9. `mcp-task-fractionator.next_one(project="phase-0-rfc")` → task with confidence 0.88

## Expected response shape

- Opens with one paragraph. First sentence ≤ 80 characters. States it is Monday and that the brief covers three projects.
- Three `### <Project name>` sections, in the order `neurodock`, `kipi-system`, `phase-0-rfc` (ranked by most-recent decision date: 2026-05-16, 2026-05-15, 2026-05-12).
- Each section has between one and three bullets. The next-action bullet quotes the `next_one.task.title` verbatim, an estimated-minutes figure, and `conf 0.92` / `conf 0.81` / `conf 0.88` (two decimal places).
- For `neurodock`, the blocker bullet quotes the literal `awaiting clinical advisor confirmation`.
- For `kipi-system`, the most-recent-decision bullet quotes one of the names returned by `recall_decisions`.
- Closing block is present. No "Elided N further projects" line (zero elided). Names `morning_peak` and `18:30`. Closes with the "not a productivity scorecard" line.
- Total response length ≤ 1800 characters.

## Pass criteria

- [ ] Tool sequence matches the nine-call trace above, in order, with no extra calls.
- [ ] First sentence of the response is ≤ 80 characters and names "Monday".
- [ ] Exactly three project sections are rendered.
- [ ] Project order is `neurodock`, `kipi-system`, `phase-0-rfc`.
- [ ] Every project section names a `Next:` action with a confidence rendered as two decimal places.
- [ ] The `neurodock` section names the literal blocker text exactly once.
- [ ] The closing block contains the strings `morning_peak`, `18:30`, and a non-judgmental sentence about yesterday.
- [ ] None of these substrings appear anywhere in the response: `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`, `executive dysfunction`.
- [ ] Total response is ≤ 1800 characters.
- [ ] No `!` (exclamation mark) anywhere in the response.
