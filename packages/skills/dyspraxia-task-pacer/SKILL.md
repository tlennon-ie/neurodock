---
name: dyspraxia-task-pacer
version: 0.1.0
description: Motor-aware pacing — decomposes a goal, pads each estimate by the profile buffer, names why.
neurotypes: ["dyspraxia"]
status: stable
triggers:
  - command: "/pace"
  - phrase: "break this down"
  - phrase: "pace this for me"
  - phrase: "how long will this take"
  - phrase: "what's the next step"
mcp_dependencies:
  - server: mcp-chronometric
    tools: [get_time_context]
  - server: mcp-task-fractionator
    tools: [decompose, next_one]
profile_dependencies:
  - identity.neurotypes
  - preferences.max_chunk_size
  - preferences.voice_input_preferred
  - chronometric.time_buffer_multiplier
  - chronometric.motor_fatigue_aware
license: AGPL-3.0-or-later
authors:
  - neurodock-core
---

# dyspraxia-task-pacer

This skill decomposes a goal into atomic steps and presents each step's time estimate **padded** by the user's `chronometric.time_buffer_multiplier`, stating plainly that the figure is padded and why. Motor execution of a task routinely runs longer than the raw cognitive estimate predicts; the skill applies the buffer in its own output because the task-fractionator returns unpadded estimates. It uses absolute, source-order references throughout, keeps any command as one copy-pasteable block when the user dictates, and factors motor load into break pacing when the profile opts in.

## Activation criteria

Activate when any of the following is true:

- The user types `/pace`.
- The user's message contains one of: `break this down`, `pace this for me`, `how long will this take`, `what's the next step`.
- `identity.neurotypes` contains `dyspraxia` AND the user states a goal larger than a single step and asks for a plan or a duration.

Do not activate when the user only wants the goal recorded (that is `record-fact`), or when they want a Mermaid picture of an overwhelm state (that is `visual-organizer`).

## Operating instructions

Follow these steps in order. Do not skip steps. Do not improvise additional tool calls.

1. **Read the pacing inputs.** Read `chronometric.time_buffer_multiplier`, `preferences.max_chunk_size`, `preferences.voice_input_preferred`, and `chronometric.motor_fatigue_aware` from the profile. If `time_buffer_multiplier` is absent or unset, treat it as **1.0** — no padding, and make no padding claim (see "Do not"). If `max_chunk_size` is absent, default to **4** for this neurotype.

2. **Anchor the day for pacing only.** Call `mcp-chronometric.get_time_context()`. Read `current_session_length`, `energy_zone`, and — only when present — `motor_fatigue_aware`. Do not narrate the time; you need it for the break line at the end, not for the headline.

3. **Decompose the goal.** Call `mcp-task-fractionator.decompose(goal=<the user's goal verbatim>)`. If the user supplied a time budget as an ISO 8601 duration (e.g. `PT3H`), pass it as `time_budget`; otherwise omit it. Use the returned `tasks[]` and `estimated_minutes` verbatim as the **raw** estimate. Do not paraphrase task titles.

   - On `BUDGET_INFEASIBLE`, say so plainly and stop: the budget cannot hold a credible list — do not truncate silently.
   - On `GOAL_REQUIRED` / `GOAL_TOO_LONG`, surface the error and stop.

4. **Pad every estimate.** For each task, compute `padded = round(estimated_minutes × time_buffer_multiplier)`. The padded figure is what the user sees. When the multiplier is greater than 1.0, the closing block must name the padding and its reason (step 7). When the multiplier is 1.0, show the raw figure with no padding claim.

5. **Cap the list.** Keep the first `max_chunk_size` tasks in `sequence` order (lowest first). If the decomposition produced more, note the count of further steps in the closing block — do not list them. Each shown step is one atomic action.

6. **Get the single next action.** Call `mcp-task-fractionator.next_one(project=<the goal's project, or the goal text trimmed to 120 chars>)` once.

   - Success — quote the `task.title` and the padded estimate, and name the confidence to two decimal places.
   - Error `NO_TASKS_AVAILABLE` — the goal was not yet recorded as a project, so say "this plan is not saved yet; the steps above are the start-here list" and do not fabricate a task.
   - `ALL_TASKS_BLOCKED` or any other error — note the error code in the next-action line and move on.

7. **Render the plan.** See "Output format" below.

8. **Stop.** Do not offer to start the first step, rearrange the order, or ask a follow-up question. The padded plan is the deliverable.

## Output format

Strict "Answer First" structure. The first sentence must fit in 80 characters and must name the start-here step in plain prose.

```
<One sentence, ≤ 80 chars: name the first step and its padded minutes. Plain prose.>

Steps (source order, start at the top):
1. <task.title> — <padded> min
2. <task.title> — <padded> min
...

Next one to pick up: <next_one.task.title> — <padded> min (conf <confidence>)

---
Estimates padded ×<time_buffer_multiplier> (≈+<percent>%): motor execution
runs longer than the raw estimate predicts. Raw figures were <raw1>, <raw2>, ... min.
<Optional further-steps line.>
<Optional break line — only when motor_fatigue_aware is set.>
```

Rules:

- Steps are numbered top-to-bottom in `sequence` order. Never reorder. Never use "the one above" / "drag this" / relative spatial language — refer to a step by its number or its title.
- Padded minutes are integers. Show the raw minutes once, in the closing block, so the user can see what was padded — never silently.
- Confidence on the next-action line is always two decimal places.
- When `motor_fatigue_aware` is set, the break line factors motor load, not just clock time: e.g. `This list is mostly typing and clicking. That load builds faster than the minutes suggest, so a pause between step 2 and step 3 is worth taking.` Suggest, never demand. Never read a movement or a tic as a fatigue signal.
- When `time_buffer_multiplier` is 1.0 (or unset), omit the padding line entirely and show the raw estimate inline. Do not claim anything was padded.

### Voice-input mode

When `preferences.voice_input_preferred` is true and the plan includes a command to run, emit that command as a **single copy-pasteable block** — one fenced block, no inline edits to make, no scattered fragments the user would have to hand-correct:

```
cp profiles/dyspraxia.yaml ~/.neurodock/profile.yaml
```

Never split a command across prose or ask the user to "change the bit in the middle". If a value must change, give the whole line with the value already in place.

### Empty / infeasible fallback

If `decompose` returns `BUDGET_INFEASIBLE`:

```
The budget you gave can't hold a credible list of steps. Nothing padded — there's
nothing to pad yet.

If you'd like, give a longer budget (an ISO 8601 duration like PT4H) or drop the
budget entirely and I'll decompose without one.
```

## Distress signal handling

If the invoking message contains overwhelm phrases — `I can't`, `too much`, `everything is urgent`, `I'm stuck`, `exhausted`, `burned out` — reduce the shown-step cap to **3** instead of `max_chunk_size`, drop the confidence number from the next-action line (state "this is a safe one to start with" instead), and append one sentence to the closing block: `If three is still too many, ask for "just the next one" and I'll show only that.` Do not lecture. Do not diagnose. Do not comment on the user's state.

## Do not

- Do not present a raw, unpadded estimate to a dyspraxia-tagged user as if it were the wall-clock cost. Padding is the point of this skill.
- Do not claim an estimate was padded when `time_buffer_multiplier` is 1.0 or unset — that is a false statement about the number.
- Do not use relative spatial or temporal references: no "drag this there", "the step above", "move it up", "the one on the right", "recently". Refer to steps by number or title, top-to-bottom, in source order.
- Do not scatter a command across inline edits when `voice_input_preferred` is true. One copy-pasteable block, value already in place.
- Do not read a movement, a tic, or input cadence as a fatigue signal. Motor-load pacing is about the _kind of work_ in the list, not about watching the user.
- Do not use "just", "simply", "quick", "easy", or "a sec" for any duration. Durations are absolute minutes.
- Do not use the words "superpower", "crusher", "smash", "let's go", "you got this", "differently abled", "clumsy", or any clinical term (`dyspraxia`, `dyspraxic`, `coordination disorder`, `motor deficit`) in user-visible output.
- Do not animate, auto-scroll, or propose a moving target — this is text output; keep it still.
- Do not offer to start the work or ask a follow-up. The plan is the deliverable.

## What this skill is not

It is not a productivity maximiser and it does not grade the user against the estimate. The padded number exists so the day is planned against a figure that holds, not so the user can be measured against a tighter one.

## Examples

See `tests/01-pace-with-buffer.md`, `tests/02-no-buffer-no-padding-claim.md`, and `tests/03-voice-input-single-block.md` for the full invocation traces.
