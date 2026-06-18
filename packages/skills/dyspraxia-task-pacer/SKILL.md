---
name: dyspraxia-task-pacer
version: 0.2.0
description: Motor-aware pacing — decomposes a goal, shows each estimate padded by the profile buffer, names why.
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
    inputs:
      decompose:
        [
          goal,
          time_budget,
          max_chunk_size,
          time_buffer_multiplier,
          motor_fatigue_aware,
        ]
      next_one: [project]
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

This skill decomposes a goal into atomic steps and presents each step's time estimate **padded** by the user's `chronometric.time_buffer_multiplier`, stating plainly that the figure is padded and why. Motor-heavy work routinely runs longer than the raw cognitive estimate predicts — the world underestimates that work, not the user — so the padded figure is the one the day should be planned against. The task-fractionator server is the single source of truth for the padding: the skill passes the buffer to `decompose` and displays the `padded_minutes` the server returns, never re-multiplying a figure that was already padded. It uses absolute, source-order references throughout, keeps any command as one copy-pasteable block when the user dictates, and factors motor load into break pacing when the profile opts in.

## Activation criteria

Activate when any of the following is true:

- The user types `/pace`.
- The user's message contains one of: `break this down`, `pace this for me`, `how long will this take`, `what's the next step`.
- `identity.neurotypes` contains `dyspraxia` AND the user states a goal larger than a single step and asks for a plan or a duration.

Do not activate when the user only wants the goal recorded (that is `record-fact`), or when they want a Mermaid picture of an overwhelm state (that is `visual-organizer`).

## Operating instructions

Follow these steps in order. Do not skip steps. Do not improvise additional tool calls.

1. **Read the pacing inputs.** Read `chronometric.time_buffer_multiplier`, `preferences.max_chunk_size`, `preferences.voice_input_preferred`, and `chronometric.motor_fatigue_aware` from the profile. If `time_buffer_multiplier` is absent or unset, treat it as **1.0** — no buffer, no padding claim (see "Do not"). If `max_chunk_size` is absent, default to **4** for this neurotype.

2. **Anchor the day for pacing only.** Call `mcp-chronometric.get_time_context()`. Read `current_session_length`, `energy_zone`, and — only when present — `motor_fatigue_aware`. Do not narrate the time; you need it for the break line at the end, not for the headline.

3. **Decompose the goal, passing the profile knobs.** Call `mcp-task-fractionator.decompose` with the goal verbatim and the profile knobs the server now understands:

   - `goal` = the user's goal verbatim.
   - `time_budget` = the user's ISO 8601 duration (e.g. `PT3H`) if they gave one, otherwise omit.
   - `max_chunk_size` = `preferences.max_chunk_size` (default 4). **The server does the capping now** — do not cap the list yourself (see step 5).
   - `time_buffer_multiplier` = `chronometric.time_buffer_multiplier`, but **only pass it when it is greater than 1.0**. When it is 1.0 or unset, omit it so the server returns the raw, unpadded shape.
   - `motor_fatigue_aware` = `chronometric.motor_fatigue_aware` when it is `true`, otherwise omit.

   Use the returned `tasks[]` verbatim. Do not paraphrase task titles.

   - On `BUDGET_INFEASIBLE`, say so plainly and stop: the budget cannot hold a credible list — do not truncate silently.
   - On `GOAL_REQUIRED` / `GOAL_TOO_LONG` / `INPUT_INVALID`, surface the error and stop.

4. **Read the displayed estimate from the server (single source of truth).** For each task, the figure the user sees is:

   - **When `padded_minutes` is present on the task** — show `padded_minutes`. The server already multiplied the raw estimate by the buffer; do **not** multiply again. The server also echoes `time_buffer_multiplier` at the top level and names the buffer in `rationale`; use the echoed multiplier for the closing line.
   - **When `padded_minutes` is absent** — there is no server-side padding (the multiplier was 1.0/unset, or the server predates this field). Fall back to showing the raw `estimated_minutes`. **Only in this fallback, and only when the profile's `time_buffer_multiplier` is greater than 1.0**, compute the padding yourself as `round(estimated_minutes × time_buffer_multiplier)` and treat that as the displayed figure. If `padded_minutes` was present you have already padded once via the server, so the skill's own multiply must not run — this is how a double-pad is prevented.

   In short: server `padded_minutes` wins when present; the skill's own arithmetic is a fallback that runs only when the server returned no padded figure.

5. **Do not re-cap the list — the server already did.** Because `max_chunk_size` was passed to `decompose`, the returned `tasks[]` is already the capped prefix; show every task it contains, in `sequence` order. Capping is the server's responsibility now; surfacing the cut is the skill's.

   - If the response carries `truncated: true`, the goal needed more steps than the cap. State this honestly in the closing block: name that further steps were left off and that they are still in the plan (you can lean on the server's `rationale`, which names the count and the recovery action — re-run without the cap to see them). Do not list the dropped steps and do not re-elide steps the server already returned.
   - If `truncated` is absent, the list is complete for this cap; add no truncation line.

6. **Get the single next action.** Call `mcp-task-fractionator.next_one(project=<the goal's project, or the goal text trimmed to 120 chars>)` once. `next_one` takes no knobs and its `task` carries **no** `padded_minutes` — so derive the displayed figure for the next action from the matching `decompose` task (match by `id`, falling back to `sequence`): show that task's `padded_minutes` when present, else the same raw/fallback figure rule as step 4. If no `decompose` task matches (e.g. the `next_one` task came from a saved project and was beyond this run's `max_chunk_size` cap), fall back to `next_one.task.estimated_minutes` with the step-4 fallback pad rule. Never multiply a `next_one` estimate a second time.

   - Success — quote the `task.title` and the displayed (padded) estimate, and name the confidence to two decimal places.
   - Error `NO_TASKS_AVAILABLE` — the goal was not yet recorded as a project, so say "this plan is not saved yet; the steps above are the start-here list" and do not fabricate a task.
   - `ALL_TASKS_BLOCKED` or any other error — note the error code in the next-action line and move on.

7. **Render the plan.** See "Output format" below.

8. **Stop.** Do not offer to start the first step, rearrange the order, or ask a follow-up question. The padded plan is the deliverable.

## Output format

Strict "Answer First" structure. The first sentence must fit in 80 characters and must name the start-here step in plain prose.

```
<One sentence, ≤ 80 chars: name the first step and its displayed minutes. Plain prose.>

Steps (source order, start at the top):
1. <task.title> — <displayed> min
2. <task.title> — <displayed> min
...

Next one to pick up: <next_one.task.title> — <displayed> min (conf <confidence>)

---
Estimates padded ×<time_buffer_multiplier> (≈+<percent>%): motor-heavy work
runs longer than the raw estimate predicts. Raw figures were <raw1>, <raw2>, ... min.
<Optional truncation line — only when the server set truncated: true.>
<Optional break line — only when motor_fatigue_aware is set.>
```

Rules:

- "Displayed minutes" is the server's `padded_minutes` when present, else the raw `estimated_minutes` (or the skill's fallback pad — step 4). Never the result of multiplying a `padded_minutes` again.
- Steps are numbered top-to-bottom in `sequence` order. Never reorder. Never use "the one above" / "drag this" / relative spatial language — refer to a step by its number or title.
- Displayed minutes are integers. Show the raw minutes once, in the closing block, so the user can see what was padded — never silently.
- Use the server's echoed top-level `time_buffer_multiplier` for the `×` figure in the closing line. Do not invent a multiplier the server did not echo.
- Confidence on the next-action line is always two decimal places.
- The truncation line reports the server's `truncated` flag honestly: that there were more steps than the cap and they are still in the plan (re-run without the cap to see them). Count is fine; do not list dropped titles.
- When `motor_fatigue_aware` is set, the break line factors motor load, not just clock time: e.g. `This list is mostly typing and clicking. That load builds faster than the minutes suggest, so a pause between step 2 and step 3 is worth taking.` Suggest, never demand. Never read a movement or a tic as a fatigue signal.
- When `time_buffer_multiplier` is 1.0 (or unset) — and so the server returned no `padded_minutes` and echoed no multiplier — omit the padding line entirely and show the raw estimate inline. Do not claim anything was padded.

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

If the invoking message contains overwhelm phrases — `I can't`, `too much`, `everything is urgent`, `I'm stuck`, `exhausted`, `burned out` — pass a smaller `max_chunk_size` of **3** to `decompose` (instead of the profile value) so the server returns a shorter prefix, drop the confidence number from the next-action line (state "this is a safe one to start with" instead), and append one sentence to the closing block: `If three is still too many, ask for "just the next one" and I'll show only that.` Do not lecture. Do not diagnose. Do not comment on the user's state.

## Do not

- Do not present a raw, unpadded estimate to a dyspraxia-tagged user as if it were the wall-clock cost when a buffer is set. The padded figure is the point of this skill.
- Do not pad twice. When the server returned `padded_minutes`, that figure is already padded — displaying it is enough. The skill's own `round(estimated_minutes × multiplier)` runs ONLY in the fallback where `padded_minutes` is absent. There is never a path where both the server and the skill multiply the same estimate.
- Do not claim an estimate was padded when `time_buffer_multiplier` is 1.0 or unset (the server returns no `padded_minutes` and echoes no multiplier) — that is a false statement about the number.
- Do not re-cap or re-elide the task list. `decompose` was given `max_chunk_size`, so the returned list is already the prefix; surface the server's `truncated` flag instead of trimming a second time.
- Do not use relative spatial or temporal references: no "drag this there", "the step above", "move it up", "the one on the right", "recently". Refer to steps by number or title, top-to-bottom, in source order.
- Do not scatter a command across inline edits when `voice_input_preferred` is true. One copy-pasteable block, value already in place.
- Do not read a movement, a tic, or input cadence as a fatigue signal. Motor-load pacing is about the _kind of work_ in the list, not about watching the user.
- Do not use "just", "simply", "quick", "easy", or "a sec" for any duration. Durations are absolute minutes.
- Do not use the words "superpower", "crusher", "smash", "let's go", "you got this", "differently abled", "clumsy", or any clinical term (`dyspraxia`, `dyspraxic`, `coordination disorder`, `motor deficit`) in user-visible output.
- Do not animate, auto-scroll, or propose a moving target — this is text output; keep it still.
- Do not offer to start the work or ask a follow-up. The plan is the deliverable.

## What this skill is not

It is not a productivity maximiser and it does not grade the user against the estimate. The padded number exists so the day is planned against a figure that holds, not so the user can be measured against a tighter one. The buffer reflects that motor-heavy work is routinely under-budgeted by everyone — it is not a measure of the user.

## Examples

See `tests/01-pace-with-buffer.md`, `tests/02-no-buffer-no-padding-claim.md`, and `tests/03-voice-input-single-block.md` for the full invocation traces.
