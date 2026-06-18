# Test: 02 — No buffer set, no padding claim

## Scenario

It is Thursday, 2026-05-21, 10:00 local time. The user identifies with dyspraxia but is running a **hand-edited profile that does not set `chronometric.time_buffer_multiplier`** (the field is absent), and `chronometric.motor_fatigue_aware` is also absent. `identity.neurotypes: ["dyspraxia"]`, `preferences.max_chunk_size: 4`, `preferences.voice_input_preferred: false`. They type `/pace draft the release notes for 0.0.39`. The goal decomposes into two atomic tasks. A project for it exists, so `next_one` succeeds.

This test guards the edge case: with no buffer, the skill must show **raw** estimates and must **not** claim anything was padded.

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
2. `mcp-task-fractionator.decompose(goal="draft the release notes for 0.0.39")` →
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
     "rationale": "Split into gather then write so the writing step starts from a fixed list."
   }
   ```
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

## Expected response shape

- Opens with one sentence ≤ 80 characters naming step 1 (`Collect the merged PRs since 0.0.38`) and `15 min` (raw, because there is no buffer).
- Two numbered steps in sequence order, each showing the raw figure (`15`, `30`). No multiplier is applied.
- A `Next one to pick up:` line quoting `Collect the merged PRs since 0.0.38`, `15 min`, and `conf 0.95`.
- The closing block does NOT contain a padding line. It does NOT contain the strings `padded`, `×`, `buffer`, or any percentage. There is nothing to declare.
- No break line, because `motor_fatigue_aware` is not set.
- Total response length ≤ 900 characters.

## Pass criteria

- [ ] Tool sequence is exactly three calls in order: `get_time_context()`, one `decompose(...)`, one `next_one(...)`.
- [ ] First sentence is ≤ 80 characters and contains `15`.
- [ ] Exactly two numbered steps; the figures shown are `15` and `30` (raw, unmodified).
- [ ] The response does NOT contain a percentage-padding claim: none of `padded`, `pad`, `×1.`, `multiplier`, `buffer`, `30%`, `+%`, or the pattern `+<digits>%` (e.g. `+30%`). (A bare `+` is fine — it may legitimately appear in a task title such as `TypeScript + React`.)
- [ ] The next-action line contains `conf 0.95`.
- [ ] No break line appears (motor_fatigue_aware absent).
- [ ] No relative spatial language: none of `drag`, `the step above`, `move it up`, `on the right`, `recently`.
- [ ] None of these substrings appear: `just`, `simply`, `quick`, `easy`, `superpower`, `crusher`, `smash`, `you got this`, `differently abled`, `clumsy`, `dyspraxia`, `dyspraxic`.
- [ ] No `!` anywhere in the response.
- [ ] Total response is ≤ 900 characters.
