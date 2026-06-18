---
"@neurodock/core": minor
---

feat(mcp-task-fractionator): optional neurotype hooks on decompose (r2)

`neurodock-mcp-task-fractionator` (Python, PyPI) `decompose` gains three
optional, additive inputs that let decomposition respect the user's knobs.
Every change is additive and optional per adr 0011: new optional inputs and
new output fields only, never a change to an existing field, and never a
neurotype branch. a call with none of the new inputs returns the exact pre-r2
wire shape (covered by a backward-compat test).

new optional inputs:

- `max_chunk_size` (1-20) — caps the number of tasks returned below the normal
  3-12 target. when the goal naturally needs more steps the server keeps the
  lowest-sequence prefix (a valid sub-dag, dangling deps filtered), sets the
  new optional `truncated` flag, and names the truncation in the rationale —
  never a silent drop or an invalid topo order.
- `time_buffer_multiplier` (1.0-3.0) — when > 1.0, each task gains an additive
  `padded_minutes` = round(estimated_minutes × multiplier). `estimated_minutes`
  stays raw so a presentation layer (the dyspraxia-task-pacer skill) never
  double-pads. multiplier echoed and named in the rationale. 1.0 is a no-op.
- `motor_fatigue_aware` (bool) — echoed and named in the rationale; the server
  has no keystroke/click stream and does not infer fatigue (honest scoping,
  mirroring mcp-chronometric #103).

tool output changes (all additive optional, omitted when the knob is inactive):

- `decompose` — per-task `padded_minutes`; top-level `time_buffer_multiplier`,
  `motor_fatigue_aware`, `truncated`. dumped with `exclude_none=true`.
- new error `INPUT_INVALID` for an out-of-range knob (rejected, never clamped).
- `next_one` now also dumps with `exclude_none=true` so the shared
  `Task.padded_minutes` (always unset there) stays off its wire — shape unchanged.

json schemas under `packages/mcp-task-fractionator/schemas/` and the pydantic
models are updated together and validated by the protocol conformance test.
