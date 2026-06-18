# Test: 03 — Voice-input mode, command as a single copy-pasteable block, with server-side truncation

## Scenario

It is Friday, 2026-05-22, 09:30 local time. The user has the `dyspraxia.yaml` preset: `identity.neurotypes: ["dyspraxia"]`, `preferences.max_chunk_size: 4`, `preferences.voice_input_preferred: true`, `chronometric.time_buffer_multiplier: 1.3`, `chronometric.motor_fatigue_aware: true`. They dictate `break this down: set up the dyspraxia profile and run the first session`. The goal would naturally produce **six** atomic tasks, but the skill passes `max_chunk_size=4` to `decompose`, so the **server** returns the first four as a valid prefix and sets `truncated: true`. The plan's first step is a shell command, so voice-input mode applies: the command must be one copy-pasteable block. `next_one` succeeds with a sequence-1 task.

This test guards two edges at once: **server-side** capping with the `truncated` flag (the skill surfaces it, it does NOT re-elide), and the voice-input single-block rule.

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
2. `mcp-task-fractionator.decompose(goal="set up the dyspraxia profile and run the first session", max_chunk_size=4, time_buffer_multiplier=1.3, motor_fatigue_aware=true)` → the server caps at four tasks (the natural plan was six) and sets `truncated: true`. Each returned task carries server-computed `padded_minutes`:

   | Sequence | Title                                         | Raw min | Server `padded_minutes` |
   | -------- | --------------------------------------------- | ------- | ----------------------- |
   | 1        | Copy the dyspraxia preset to the profile path | 5       | 6                       |
   | 2        | Open the profile and confirm the four fields  | 10      | 13                      |
   | 3        | Start the first session with a stated intent  | 5       | 6                       |
   | 4        | Decompose the first real goal                 | 15      | 20                      |

   Step 1's `description` names the exact command `cp profiles/dyspraxia.yaml ~/.neurodock/profile.yaml`. The response also carries top-level `time_buffer_multiplier: 1.3`, `motor_fatigue_aware: true`, and `truncated: true`. The two further steps (sequences 5–6 in the natural plan) are NOT in the response — the server dropped them as part of the cap and named the truncation in the rationale (`Truncated to the first 4 of 6 tasks at your max_chunk_size; the dropped steps still need doing — re-run without the cap (or raise it) to see them.`).

3. `mcp-task-fractionator.next_one(project="set up the dyspraxia profile and run the first session")` → task = sequence-1 (`Copy the dyspraxia preset to the profile path`), raw `estimated_minutes: 5`, NO `padded_minutes` (next_one never pads), `confidence: 0.95`.

## Padding: server-computed; note the `.5` rounding

The server returned `padded_minutes` per task. Note `round(5 × 1.3) = round(6.5) = 6` (Python round-half-to-even, the server's authority) — the skill must show `6`, not `7`. The next-action figure for sequence-1 mirrors the matching `decompose` task's `padded_minutes` of `6` (the skill does not re-multiply the bare `next_one` estimate).

| Sequence | Raw | Server `padded_minutes` (displayed) |
| -------- | --- | ----------------------------------- |
| 1        | 5   | 6                                   |
| 2        | 10  | 13                                  |
| 3        | 5   | 6                                   |
| 4        | 15  | 20                                  |

(Sequences 5 and 6 of the natural plan were dropped by the SERVER under the cap — the skill never sees them.)

## Expected response shape

- Opens with one sentence ≤ 80 characters naming step 1 and its displayed figure `6 min`.
- Exactly four numbered steps (the four the server returned), displayed figures `6`, `13`, `6`, `20`.
- The step-1 command appears exactly once, as a single fenced code block containing the whole line `cp profiles/dyspraxia.yaml ~/.neurodock/profile.yaml` — value already in place, nothing to hand-edit. The command is NOT split across prose and is NOT presented as a fragment to insert into a larger file.
- A `Next one to pick up:` line quoting `Copy the dyspraxia preset to the profile path`, `6 min`, `conf 0.95`.
- The closing block names `×1.3`, `+30%`, the four shown raw figures (`5, 10, 5, 15`), a truncation line driven by the server's `truncated: true` flag stating that there were more steps than the cap (e.g. `2 further steps` / `4 of 6`) and that they still need doing — count only, no titles for the dropped steps — and one suggestion-framed break line referring to step numbers.
- Total response length ≤ 1500 characters.

## Pass criteria

- [ ] Tool sequence is exactly three calls in order: `get_time_context()`, one `decompose(...)`, one `next_one(...)`.
- [ ] The `decompose` call passes `max_chunk_size=4`, `time_buffer_multiplier=1.3`, and `motor_fatigue_aware=true`.
- [ ] Exactly four numbered steps appear (the four the server returned); no fifth or sixth step is shown.
- [ ] The displayed figures `6`, `13`, `6`, `20` appear on the step lines; the raw figures appear only in the closing block.
- [ ] The step-1 / step-3 figure is `6` (the server's `round(6.5)`), NOT `7` — the skill consumed `padded_minutes` and did not re-multiply.
- [ ] The command `cp profiles/dyspraxia.yaml ~/.neurodock/profile.yaml` appears exactly once, inside a single fenced code block, as a complete line.
- [ ] The command is not broken across two code blocks and not embedded in prose with an instruction to edit part of it.
- [ ] The closing block surfaces the server's truncation honestly: it contains a count of further steps (e.g. `2 further steps` or `4 of 6`) and does NOT contain any sequence-5 or sequence-6 title.
- [ ] The skill does NOT re-elide: the four returned tasks are all shown; the truncation line reports the server's `truncated` flag, it does not trim a list the server already trimmed.
- [ ] The closing block contains `×1.3` and `30%`.
- [ ] A break line is present and contains no comment on the user's body, movement, or tics.
- [ ] No relative spatial language: none of `drag`, `the step above`, `move it up`, `on the right`, `recently`.
- [ ] None of these substrings appear: `just`, `simply`, `quick`, `easy`, `superpower`, `crusher`, `smash`, `you got this`, `differently abled`, `clumsy`, `dyspraxia`, `dyspraxic` (note: the literal file path `dyspraxia.yaml` inside the command block is exempt — it is a real filename, asserted separately above).
- [ ] No `!` anywhere in the response.
- [ ] Total response is ≤ 1500 characters.
