# Test: 01 — Pace a goal with the buffer applied, happy path

## Scenario

It is Wednesday, 2026-05-20, 14:10 local time. The user has the `dyspraxia.yaml` preset installed: `identity.neurotypes: ["dyspraxia"]`, `preferences.max_chunk_size: 4`, `preferences.voice_input_preferred: true`, `chronometric.time_buffer_multiplier: 1.3`, `chronometric.motor_fatigue_aware: true`. They type `pace this for me: wire the new settings panel into the popup`. The goal is bigger than one step. There is no project recorded for it yet, so `next_one` will return `NO_TASKS_AVAILABLE`. The decomposition produces four atomic tasks, none of which involve a command to copy-paste.

The buffer (1.3) and `motor_fatigue_aware` are now passed to `decompose`; the server is the source of truth for the padded figure. The skill displays the server's per-task `padded_minutes` and does NOT multiply again.

## Expected MCP tool sequence

1. `mcp-chronometric.get_time_context()` →
   ```json
   {
     "now": "2026-05-20T14:10:03+01:00",
     "day_of_week": "Wednesday",
     "time_since_last_prompt": "PT0S",
     "current_session_length": "PT12M",
     "energy_zone": "afternoon_dip",
     "motor_fatigue_aware": true
   }
   ```
2. `mcp-task-fractionator.decompose(goal="wire the new settings panel into the popup", max_chunk_size=4, time_buffer_multiplier=1.3, motor_fatigue_aware=true)` →
   ```json
   {
     "tasks": [
       {
         "id": "a1b2c3d4-1111-4aaa-8bbb-000000000001",
         "title": "Add the SettingsPanel component file",
         "description": "Create the SettingsPanel.tsx component with the four reader fields, no wiring yet.",
         "estimated_minutes": 30,
         "padded_minutes": 39,
         "acceptance_criteria": [
           "File exists at the named path",
           "Component renders the four fields"
         ],
         "dependencies": [],
         "sequence": 1,
         "tags": ["frontend"]
       },
       {
         "id": "a1b2c3d4-1111-4aaa-8bbb-000000000002",
         "title": "Import SettingsPanel into the popup entrypoint",
         "description": "Add the import and render SettingsPanel under the existing Home view.",
         "estimated_minutes": 20,
         "padded_minutes": 26,
         "acceptance_criteria": [
           "Popup mounts SettingsPanel",
           "No console errors on open"
         ],
         "dependencies": ["a1b2c3d4-1111-4aaa-8bbb-000000000001"],
         "sequence": 2,
         "tags": ["frontend"]
       },
       {
         "id": "a1b2c3d4-1111-4aaa-8bbb-000000000003",
         "title": "Persist the four fields to local storage",
         "description": "Read and write the four field values via the existing storage helper.",
         "estimated_minutes": 40,
         "padded_minutes": 52,
         "acceptance_criteria": ["Values survive a popup reopen"],
         "dependencies": ["a1b2c3d4-1111-4aaa-8bbb-000000000002"],
         "sequence": 3,
         "tags": ["frontend"]
       },
       {
         "id": "a1b2c3d4-1111-4aaa-8bbb-000000000004",
         "title": "Add a regression test for the panel mount",
         "description": "Assert SettingsPanel renders the four fields in the popup test.",
         "estimated_minutes": 25,
         "padded_minutes": 32,
         "acceptance_criteria": ["Test passes", "Covers the four-field render"],
         "dependencies": ["a1b2c3d4-1111-4aaa-8bbb-000000000003"],
         "sequence": 4,
         "tags": ["test"]
       }
     ],
     "rationale": "Carved the goal into 4 task(s). Estimated total: 115 minutes across 4 tasks. Sequence is a total order; tasks at the same topological depth are tie-broken by estimated_minutes then id. padded_minutes is each raw estimate multiplied by your time_buffer_multiplier of 1.3; estimated_minutes stays raw so nothing is padded twice. motor_fatigue_aware is on: this server has no view of your actual motor activity, so it only flags the preference for the client to act on and does not infer fatigue.",
     "time_buffer_multiplier": 1.3,
     "motor_fatigue_aware": true
   }
   ```
3. `mcp-task-fractionator.next_one(project="wire the new settings panel into the popup")` → error `NO_TASKS_AVAILABLE` (the goal was never recorded as a project; this is a fresh decomposition).

(The skill MUST NOT call `decompose` more than once and MUST NOT retry `next_one`.)

## Padding: server-computed, NOT recomputed by the skill

The server returned `padded_minutes` per task using `round(estimated_minutes × 1.3)`. The skill DISPLAYS these and does not multiply again. Note the `.5` case: `round(25 × 1.3) = round(32.5) = 32` (Python round-half-to-even, the server's authority) — the skill must show `32`, not `33`.

| Step | Raw min | Server `padded_minutes` (displayed) |
| ---- | ------- | ----------------------------------- |
| 1    | 30      | 39                                  |
| 2    | 20      | 26                                  |
| 3    | 40      | 52                                  |
| 4    | 25      | 32                                  |

## Expected response shape

- Opens with one sentence ≤ 80 characters that names step 1 (`Add the SettingsPanel component file`) and its displayed figure `39 min`.
- A numbered `Steps` list, in `sequence` order 1→4, each line `<title> — <displayed> min`. Exactly four steps (the server already capped at `max_chunk_size = 4`; none elided by the skill).
- A `Next one to pick up:` line. Because `next_one` returned `NO_TASKS_AVAILABLE`, it states the plan is not saved yet and that the steps above are the start-here list — it does NOT fabricate a task or a confidence number.
- Closing block names the server's echoed multiplier (`×1.3`), an approximate percentage (`+30%`), and the four raw figures (`30, 20, 40, 25`).
- Because `motor_fatigue_aware` is set, the closing block includes one suggestion-framed break line that refers to the _kind of work_ (frontend / typing-and-clicking), not to anything observed about the user, and refers to steps by number.
- No `truncated` flag is present (the natural plan was four tasks), so there is no truncation line.
- Total response length ≤ 1400 characters.

## Pass criteria

- [ ] Tool sequence is exactly three calls in order: `get_time_context()`, one `decompose(...)`, one `next_one(...)`.
- [ ] The `decompose` call passes `max_chunk_size=4`, `time_buffer_multiplier=1.3`, and `motor_fatigue_aware=true`.
- [ ] First sentence is ≤ 80 characters and contains both the step-1 title and the number `39`.
- [ ] Exactly four numbered steps appear, in sequence order, each showing the server's `padded_minutes` figure (`39`, `26`, `52`, `32`).
- [ ] The step-4 figure is `32` (the server's `round(32.5)`), NOT `33` — the skill consumed `padded_minutes` and did not re-multiply.
- [ ] None of the raw figures (`30`, `20`, `40`, `25`) appears on a step line; the raw figures appear only in the closing block.
- [ ] The next-action line contains `not saved yet` (or equivalent) and contains no fabricated task title and no `conf` number.
- [ ] The closing block contains `×1.3`, `30%`, and all four raw figures.
- [ ] A break line is present (motor_fatigue_aware is set) and contains no comment on the user's body, movement, or tics; it refers to a step by number.
- [ ] No truncation line appears (the response carries no `truncated` flag).
- [ ] No relative spatial language appears: none of `drag`, `the step above`, `move it up`, `on the right`, `recently`.
- [ ] None of these substrings appear: `just`, `simply`, `quick`, `easy`, `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`, `clumsy`, `dyspraxia`, `dyspraxic`.
- [ ] No `!` anywhere in the response.
- [ ] Total response is ≤ 1400 characters.
