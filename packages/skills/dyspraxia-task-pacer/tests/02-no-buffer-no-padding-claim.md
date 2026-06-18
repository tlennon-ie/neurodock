# Test: 02 — No buffer set, no padding claim

## Scenario

It is Thursday, 2026-05-21, 10:00 local time. The user identifies with dyspraxia but is running a **hand-edited profile that does not set `chronometric.time_buffer_multiplier`** (the field is absent), and `chronometric.motor_fatigue_aware` is also absent. `identity.neurotypes: ["dyspraxia"]`, `preferences.max_chunk_size: 4`, `preferences.voice_input_preferred: false`. They type `/pace draft the release notes for 0.0.39`. The goal decomposes into two atomic tasks. A project for it exists, so `next_one` succeeds.

This test guards the **no-buffer fallback path**: with no buffer, the skill omits `time_buffer_multiplier` (and `motor_fatigue_aware`) from the `decompose` call, the server returns **no** `padded_minutes` and echoes **no** multiplier, the skill shows the **raw** `estimated_minutes`, runs none of its own padding arithmetic, and claims nothing was padded.

## Expected MCP tool sequence

1. `mcp-chronometric.get_time_context()` →
   ```json
   {
     "now": "2026-05-21T10:00:00+01:00",
     "day_of_week": "Thursday",
     "time_since_last_prompt": "PT0S",
     "current_session_length": "PT3M",
     "energy_zone": "morning_peak"
   }
   ```
   (Note: no `motor_fatigue_aware` field — the profile did not opt in.)
2. `mcp-task-fractionator.decompose(goal="draft the release notes for 0.0.39", max_chunk_size=4)` — `time_buffer_multiplier` and `motor_fatigue_aware` are OMITTED because neither is set in the profile (multiplier unset ⇒ treat as 1.0 ⇒ do not pass it) →
   ```json
   {
     "tasks": [
       {
         "id": "b2c3d4e5-2222-4aaa-8bbb-000000000001",
         "title": "Collect the merged PRs since 0.0.38",
         "description": "List the PR titles merged since the 0.0.38 tag from the changelog.",
         "estimated_minutes": 15,
         "acceptance_criteria": ["List covers every PR since the tag"],
         "dependencies": [],
         "sequence": 1,
         "tags": ["writing"]
       },
       {
         "id": "b2c3d4e5-2222-4aaa-8bbb-000000000002",
         "title": "Write the user-facing summary block",
         "description": "Turn the PR list into a short user-facing notes block.",
         "estimated_minutes": 30,
         "acceptance_criteria": [
           "Block reads in plain prose",
           "No internal jargon"
         ],
         "dependencies": ["b2c3d4e5-2222-4aaa-8bbb-000000000001"],
         "sequence": 2,
         "tags": ["writing"]
       }
     ],
     "rationale": "Carved the goal into 2 task(s). Estimated total: 45 minutes across 2 tasks. Sequence is a total order; tasks at the same topological depth are tie-broken by estimated_minutes then id."
   }
   ```
   (No `padded_minutes` on any task; no top-level `time_buffer_multiplier`, `motor_fatigue_aware`, or `truncated` — the server dumps `exclude_none=true` and no knob was active, so the wire shape is the pre-R2 `tasks` + `rationale` only.)
3. `mcp-task-fractionator.next_one(project="draft the release notes for 0.0.39")` →
   ```json
   {
     "task": {
       "id": "b2c3d4e5-2222-4aaa-8bbb-000000000001",
       "title": "Collect the merged PRs since 0.0.38",
       "description": "List the PR titles merged since the 0.0.38 tag from the changelog.",
       "estimated_minutes": 15,
       "acceptance_criteria": ["List covers every PR since the tag"],
       "dependencies": [],
       "sequence": 1,
       "tags": ["writing"]
     },
     "reasoning": "Sequence 1 with all dependencies satisfied. No other unblocked candidates, so this is the unique next step. 2 task(s) still pending in this project.",
     "confidence": 0.95
   }
   ```

## Padding: none in effect, none claimed

There is no `padded_minutes` on any task and the server echoed no multiplier, so the skill shows the raw `estimated_minutes` (`15`, `30`) and runs none of its own padding arithmetic. (The skill's fallback multiply only runs when `padded_minutes` is absent AND the profile multiplier is greater than 1.0 — here the multiplier is unset, so even the fallback stays silent.)

## Expected response shape

- Opens with one sentence ≤ 80 characters naming step 1 (`Collect the merged PRs since 0.0.38`) and `15 min` (raw, because there is no buffer).
- Two numbered steps in sequence order, each showing the raw figure (`15`, `30`). No multiplier is applied.
- A `Next one to pick up:` line quoting `Collect the merged PRs since 0.0.38`, `15 min`, and `conf 0.95`.
- The closing block does NOT contain a padding line. It does NOT contain the strings `padded`, `×`, `buffer`, or any percentage. There is nothing to declare.
- No truncation line (no `truncated` flag).
- No break line, because `motor_fatigue_aware` is not set.
- Total response length ≤ 900 characters.

## Pass criteria

- [ ] Tool sequence is exactly three calls in order: `get_time_context()`, one `decompose(...)`, one `next_one(...)`.
- [ ] The `decompose` call passes `max_chunk_size=4` and does NOT pass `time_buffer_multiplier` or `motor_fatigue_aware` (both unset in the profile).
- [ ] First sentence is ≤ 80 characters and contains `15`.
- [ ] Exactly two numbered steps; the figures shown are `15` and `30` (raw, unmodified).
- [ ] The response does NOT contain a percentage-padding claim: none of `padded`, `pad`, `×1.`, `multiplier`, `buffer`, `30%`, `+%`, or the pattern `+<digits>%` (e.g. `+30%`). (A bare `+` is fine — it may legitimately appear in a task title such as `TypeScript + React`.)
- [ ] The next-action line contains `conf 0.95`.
- [ ] No break line appears (motor_fatigue_aware absent).
- [ ] No truncation line appears (no `truncated` flag).
- [ ] No relative spatial language: none of `drag`, `the step above`, `move it up`, `on the right`, `recently`.
- [ ] None of these substrings appear: `just`, `simply`, `quick`, `easy`, `superpower`, `crusher`, `smash`, `you got this`, `differently abled`, `clumsy`, `dyspraxia`, `dyspraxic`.
- [ ] No `!` anywhere in the response.
- [ ] Total response is ≤ 900 characters.
