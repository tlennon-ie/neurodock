# Test: 03 — Voice-input mode, command as a single copy-pasteable block, with elision

## Scenario

It is Friday, 2026-05-22, 09:30 local time. The user has the `dyspraxia.yaml` preset: `identity.neurotypes: ["dyspraxia"]`, `preferences.max_chunk_size: 4`, `preferences.voice_input_preferred: true`, `chronometric.time_buffer_multiplier: 1.3`, `chronometric.motor_fatigue_aware: true`. They dictate `break this down: set up the dyspraxia profile and run the first session`. The decomposition produces **six** atomic tasks (two more than `max_chunk_size`, so two must be elided with a count). The plan's first step is a shell command, so voice-input mode applies: the command must be one copy-pasteable block. `next_one` succeeds with a sequence-1 task.

This test guards two edges at once: list capping with an elision count, and the voice-input single-block rule.

## Expected MCP tool sequence

1. `mcp-chronometric.get_time_context()` →
   ```json
   {
     "now": "2026-05-22T09:30:00+01:00",
     "day_of_week": "Friday",
     "current_session_length": "PT5M",
     "energy_zone": "morning_peak",
     "motor_fatigue_aware": true
   }
   ```
2. `mcp-task-fractionator.decompose(goal="set up the dyspraxia profile and run the first session")` → six tasks, `estimated_minutes` per sequence:

   | Sequence | Title                                         | Raw min |
   | -------- | --------------------------------------------- | ------- |
   | 1        | Copy the dyspraxia preset to the profile path | 5       |
   | 2        | Open the profile and confirm the four fields  | 10      |
   | 3        | Start the first session with a stated intent  | 5       |
   | 4        | Decompose the first real goal                 | 15      |
   | 5        | Pick the next single action                   | 5       |
   | 6        | Mark the session end                          | 5       |

   Step 1's `description` names the exact command `cp profiles/dyspraxia.yaml ~/.neurodock/profile.yaml`.

3. `mcp-task-fractionator.next_one(project="set up the dyspraxia profile and run the first session")` → task = sequence-1 (`Copy the dyspraxia preset to the profile path`), `confidence: 0.95`.

## Padding arithmetic (multiplier 1.3, round half-up)

| Sequence | Raw | Padded |
| -------- | --- | ------ |
| 1        | 5   | 7      |
| 2        | 10  | 13     |
| 3        | 5   | 7      |
| 4        | 15  | 20     |

(Sequences 5 and 6 are elided — only the first `max_chunk_size = 4` are shown.)

## Expected response shape

- Opens with one sentence ≤ 80 characters naming step 1 and its padded figure `7 min`.
- Exactly four numbered steps (sequences 1–4), padded figures `7`, `13`, `7`, `20`.
- The step-1 command appears exactly once, as a single fenced code block containing the whole line `cp profiles/dyspraxia.yaml ~/.neurodock/profile.yaml` — value already in place, nothing to hand-edit. The command is NOT split across prose and is NOT presented as a fragment to insert into a larger file.
- A `Next one to pick up:` line quoting `Copy the dyspraxia preset to the profile path`, `7 min`, `conf 0.95`.
- The closing block names `×1.3`, `+30%`, the four shown raw figures (`5, 10, 5, 15`), an elision line stating `2 further steps` (count only, no titles for sequences 5–6), and one suggestion-framed break line referring to step numbers.
- Total response length ≤ 1500 characters.

## Pass criteria

- [ ] Tool sequence is exactly three calls in order: `get_time_context()`, one `decompose(...)`, one `next_one(...)`.
- [ ] Exactly four numbered steps appear (sequences 1–4); sequences 5 and 6 are not shown.
- [ ] The padded figures `7`, `13`, `7`, `20` appear on the step lines; the raw figures appear only in the closing block.
- [ ] The command `cp profiles/dyspraxia.yaml ~/.neurodock/profile.yaml` appears exactly once, inside a single fenced code block, as a complete line.
- [ ] The command is not broken across two code blocks and not embedded in prose with an instruction to edit part of it.
- [ ] The closing block contains `2 further steps` (or `Elided 2`) and does NOT contain the sequence-5 or sequence-6 titles (`Pick the next single action`, `Mark the session end`).
- [ ] The closing block contains `×1.3` and `30%`.
- [ ] A break line is present and contains no comment on the user's body, movement, or tics.
- [ ] No relative spatial language: none of `drag`, `the step above`, `move it up`, `on the right`, `recently`.
- [ ] None of these substrings appear: `just`, `simply`, `quick`, `easy`, `superpower`, `crusher`, `smash`, `you got this`, `differently abled`, `clumsy`, `dyspraxia`, `dyspraxic` (note: the literal file path `dyspraxia.yaml` inside the command block is exempt — it is a real filename, asserted separately above).
- [ ] No `!` anywhere in the response.
- [ ] Total response is ≤ 1500 characters.
