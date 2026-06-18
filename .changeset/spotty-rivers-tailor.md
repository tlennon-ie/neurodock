---
"@neurodock/core": minor
---

add eight optional per-neurotype tailoring fields to the profile schema (adr 0011)

promotes the eight fields previously tracked as "candidate fields for a future
schema bump" in `profiles/README.md` from documented intent to real, optional,
additive schema fields. per adr 0011 (and the additive-only contract of adr
0004 / adr 0005), every field is optional, never required, and never
type-narrowing, so an existing v0.1.0 profile that carries none of them keeps
validating unchanged.

under `preferences`:

- `line_height_hint` — `"compact" | "default" | "relaxed"` categorical
  line-height hint for rich-text clients, alongside `reading_font_hint`.
- `voice_input_preferred` — boolean; when true, skills keep examples
  copy-pasteable as a single block (dictation-first users).

under `chronometric`:

- `calendar_phase` — `"teaching" | "marking" | "exam" | "deadlines" | "break"`.
- `weekday_overrides` — per-weekday overrides for `end_of_day_local` and
  `hyperfocus_break_minutes` (weekday-keyed object; override objects reject
  unknown keys).
- `protected_windows` — list of `{ start, end, label? }` local-time ranges
  where the hyperfocus monitor should hard-surface rather than nudge.
- `deadline_cluster_awareness` — boolean.
- `time_buffer_multiplier` — number 1.0–3.0, neutral default 1.0.
- `motor_fatigue_aware` — boolean, neutral default false.

the schema stays at `$id` `.../profile/v0.1.0/...`: per adr 0004 the `$id`
only changes on a major bump, and additive optional fields are backward-
compatible within the v0.1.x line. no `$id` references elsewhere in the repo
needed changing.

also exports hand-written `Profile` typescript types (with the new optional
fields) from `@neurodock/core`, linked to the schema by a runtime-assertion
test so the two cannot drift. no runtime dependency added — ajv / ajv-formats /
yaml are dev-only test dependencies.

note for the release commit: this changeset bumps `package.json` to `0.1.0`;
the `version` constant in `src/index.ts` must be bumped to match in the same
commit (the two are joined).
