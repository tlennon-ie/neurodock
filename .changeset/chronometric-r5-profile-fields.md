---
"@neurodock/core": minor
---

feat(mcp-chronometric): consume the r5 chronometric profile fields

`neurodock-mcp-chronometric` (Python, PyPI) now reads and honours the optional
`chronometric` profile fields added in r5 part a, alongside the existing
`privacy.os_idle_consent`. Every change is additive and optional per adr 0011:
new output fields only, never a change to an existing field, and never a
neurotype branch. a profile that declares none of the new fields produces the
exact pre-r5 wire shape on every tool (covered by a backward-compat test).

read from `profile.chronometric`:

- `weekday_overrides` — today's entry re-anchors the effective `end_of_day_local`
  and `hyperfocus_break_minutes` on top of the base values; an absent or empty
  override inherits the base.
- `protected_windows` — local-time ranges (midnight-wrap supported when
  `end` < `start`) where the break logic hard-surfaces.
- `calendar_phase`, `deadline_cluster_awareness`, `motor_fatigue_aware` — surfaced.

tool output changes (all additive optional, omitted when unset):

- `get_time_context` — `effective_end_of_day_local`, `past_end_of_day`,
  `calendar_phase`, `deadline_cluster_awareness`, `motor_fatigue_aware`.
- `request_break_if_needed` — `escalation` (`nudge` | `hard_surface`) and
  `protected_window_label`; hard-surfaces when the current local time is inside
  a protected window, even below the threshold.
- `idle_status` — `motor_fatigue_aware` (a declared preference, surfaced
  regardless of consent; the server has no keystroke/click stream so reading
  actual motor activity stays gated by `os_idle_consent`).

`time_buffer_multiplier` is intentionally not consumed here — it belongs to the
task-fractionator. json schemas under `packages/mcp-chronometric/schemas/` and
the pydantic models are updated together and validated by the protocol
conformance test.
