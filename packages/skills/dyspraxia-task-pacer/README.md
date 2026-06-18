# dyspraxia-task-pacer

A motor-aware pacing skill. It takes a goal, decomposes it into atomic steps, and presents each step's time estimate **padded** by the buffer in your profile — stating plainly that the figure is padded and why.

## Why padding

Motor-heavy work routinely runs 30–50% longer than the raw cognitive estimate predicts — the world under-budgets that work, it is not a measure of you. The task-fractionator server applies your `chronometric.time_buffer_multiplier` (1.3 in the `dyspraxia.yaml` preset, ≈+30%) and returns a `padded_minutes` figure alongside the raw one; this skill passes the buffer to the server and displays that padded figure, so the day is planned against a number that holds. The server is the single source of truth for the padding, so a figure is never multiplied twice. The raw figures are still shown once, in the closing block, so nothing is hidden. (If you run an older server that does not return `padded_minutes`, the skill falls back to padding the raw estimate itself — still exactly once.)

## When it fires

- You type `/pace` or one of `break this down`, `pace this for me`, `how long will this take`, `what's the next step`.
- You state a goal larger than one step and ask for a plan or a duration.

## How it reads your profile

- `chronometric.time_buffer_multiplier` — the padding factor, passed to the task-fractionator so the server pads. If it is unset, nothing is padded and no padding claim is made; you see the raw estimate.
- `preferences.max_chunk_size` — how many steps are returned (4 in the preset), passed to the task-fractionator so the server caps the list. When the goal needs more steps, the server flags it and the skill says how many were left off — it never silently drops them.
- `preferences.voice_input_preferred` — when true, any command is emitted as a single copy-pasteable block, value already in place, nothing to hand-edit.
- `chronometric.motor_fatigue_aware` — when set, the closing break line factors the _kind of work_ in the list (typing, clicking) into the pacing, not just the clock. It never reads a movement as a signal.

## What it does not do

It does not grade you against the estimate, does not start the work for you, and does not use relative spatial references ("the step above", "drag this"). Steps are numbered top-to-bottom in source order.

## References

- [ADR 0003 — task-fractionator tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0003-task-fractionator-tool-design.md)
- ADR 0011 — per-neurotype tailoring fields (`time_buffer_multiplier`, `voice_input_preferred`, `motor_fatigue_aware`).
- `profiles/dyspraxia.yaml` — the preset this skill is tuned for.

## License

AGPL-3.0-or-later.
