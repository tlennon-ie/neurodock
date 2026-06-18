# profiles/

Curated profile presets ship here. Each preset is a complete, valid
`profile.yaml` matching the schema in
[`packages/core/schemas/profile.schema.json`](../packages/core/schemas/profile.schema.json).

A preset is an **opinionated default, not a prescription**. The user is
the authority on their own neurotype and on what works for them
(MANIFESTO §3). Pick the preset whose lived-experience description
matches yours, copy it into place, and edit anything that does not
serve you.

## Available presets

| Preset                                               | Distinctive tuning                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`adhd.yaml`](adhd.yaml)                             | `max_chunk_size: 5`, `hyperfocus_break_minutes: 75`, `reading_font_hint: lexend`. Activates `adhd-daily-planner`, `hyperfocus-formatter`, `audhd-context-recovery`, `visual-organizer`.                                                                                                                                                                                                                                                                                         |
| [`audhd.yaml`](audhd.yaml)                           | `neurotypes: ["audhd"]` (first-class, not a sum). 75-minute break cadence + `end_of_day_local` pre-set. Activates `audhd-context-recovery` (primary), plus ADHD- and ASD-tagged skills including `asd-meeting-translator`.                                                                                                                                                                                                                                                      |
| [`ocd.yaml`](ocd.yaml)                               | Strictest guardrail config: `rumination_threshold: 2` over a 60-minute window, `sycophancy_check: refuse`. Activates `ocd-decision-finalizer`.                                                                                                                                                                                                                                                                                                                                  |
| [`dyslexic.yaml`](dyslexic.yaml)                     | `reading_font_hint: atkinson_hyperlegible`, `line_height_hint: relaxed`, `max_chunk_size: 4`, `output_format: answer_first` for fast scanning.                                                                                                                                                                                                                                                                                                                                  |
| [`low-stimulation.yaml`](low-stimulation.yaml)       | Temporary-override shape. `neurotypes: []` (no identity claim), `max_chunk_size: 3`, `hyperfocus_break_minutes: 60`, all guardrails at most-protective values.                                                                                                                                                                                                                                                                                                                  |
| [`educator-semester.yaml`](educator-semester.yaml)   | Profession-shaped, not neurotype-shaped. `neurotypes: []` (overlay a neurotype preset), `output_format: answer_first` for triage, `hyperfocus_break_minutes: 75` (lecture/marking blocks), `end_of_day_local: "17:00"` (firmer EOD to defend non-work hours). `calendar_phase: teaching`, a Wednesday `weekday_overrides` EOD bump to 18:30, and lunch/evening `protected_windows`. Drop break cadence to 60 during marking weeks.                                              |
| [`dyspraxia.yaml`](dyspraxia.yaml)                   | For self-identified dyspraxic users. `neurotypes: ["dyspraxia"]`, `max_chunk_size: 4`, `hyperfocus_break_minutes: 60` (motor-fatigue compounds faster than cognitive-only), `motion: reduced` hard-pinned for vestibular sensitivity (bodily-safety, not aesthetic). `voice_input_preferred: true`, `time_buffer_multiplier: 1.3` (+30%), `motor_fatigue_aware: true`.                                                                                                          |
| [`tourette.yaml`](tourette.yaml)                     | For self-identified Tourette / tic-condition users. `neurotypes: ["tourette"]`, `max_chunk_size: 5`, `hyperfocus_break_minutes: 75` (tic-suppression compounds fatigue), `motion: reduced` hard-pinned because sudden motion / autoplay / flashing can act as startle and tic triggers (bodily-safety, not aesthetic), `motor_fatigue_aware: true`. OCD/ADHD overlap is common but NOT assumed — add those tags to compose their tuning.                                        |
| [`burnout-recovery.yaml`](burnout-recovery.yaml)     | **Temporary state preset.** `neurotypes: []` (overlay a neurotype preset). `max_chunk_size: 3` for success-stacking, `hyperfocus_break_minutes: 45` (firm — don't grind through recovery), `end_of_day_local: "16:30"` (firm-early), `sycophancy_check: refuse` (substrate MUST refuse to validate "push through"), `rumination_threshold: 2`. Revisit in 4-6 weeks. **Not a clinical tool** — pair with human support.                                                         |
| [`student-university.yaml`](student-university.yaml) | Student-life-shaped, not neurotype-shaped. `neurotypes: []` (overlay a neurotype preset). `max_chunk_size: 5`, `hyperfocus_break_minutes: 90` (library-session blocks), `end_of_day_local: "22:00"` (honest about real student schedules — interrupts the 2am-essay spiral). `calendar_phase: teaching`, `deadline_cluster_awareness: true`, a Saturday `weekday_overrides` break bump to 120, lunch/wind-down `protected_windows`. Drop break cadence to 60 during exam weeks. |

## How to use a preset

```bash
# one-shot install
cp profiles/<name>.yaml ~/.neurodock/profile.yaml

# temporary swap (e.g. low-stimulation for a hard week)
cp ~/.neurodock/profile.yaml ~/.neurodock/profile.yaml.bak
cp profiles/low-stimulation.yaml ~/.neurodock/profile.yaml
# later
mv ~/.neurodock/profile.yaml.bak ~/.neurodock/profile.yaml
```

Then edit the file. Every field has a default; everything below
`identity` is optional. Loader precedence and validation are documented
in the schema and in `profile.example.yaml`.

## Self-ID, not diagnosis

These presets are named for the lived experience they target. None of
them implies a diagnosis, and NeuroDock never asks for one. The schema
treats `identity.neurotypes` as a self-identification list and never
gates features on it — see ETHICS §"On self-identification".

## Per-neurotype tailoring fields (added v0.1.x, ADR 0011)

These eight optional fields were promoted from "candidate" to real schema
fields under [ADR 0011](../docs/decisions/0011-neurotype-schema-strategy.md).
Every one is **optional and additive**: a profile that omits them validates
exactly as before, and the loader applies a neutral default at read time. They
express per-neurotype tailoring through populated values and presentation hints
— never by changing the required shape. The "consumer" column tracks which
package reads each field; "pending" means the schema field has landed but the
consuming code ships in a later PR.

| Field                                     | Type / values                                                                                                                                                | Set by preset(s)                          | Consumer / status                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------- |
| `preferences.line_height_hint`            | `"compact" \| "default" \| "relaxed"` — advisory body-paragraph line-height bands; clients MUST keep body spacing ≥ 1.5 in every band (WCAG 1.4.8 / 1.4.12). | `dyslexic`                                | clients rendering rich text (pending)   |
| `preferences.voice_input_preferred`       | boolean                                                                                                                                                      | `dyspraxia`                               | skill shaping layer (pending)           |
| `chronometric.calendar_phase`             | `"teaching" \| "marking" \| "exam" \| "deadlines" \| "break"`                                                                                                | `educator-semester`, `student-university` | consumed by mcp-chronometric (pending)  |
| `chronometric.weekday_overrides`          | map of weekday → `{ end_of_day_local?, hyperfocus_break_minutes? }`                                                                                          | `educator-semester`, `student-university` | consumed by mcp-chronometric (pending)  |
| `chronometric.protected_windows`          | list of `{ start, end, label? }` local-time ranges                                                                                                           | `educator-semester`, `student-university` | consumed by mcp-chronometric (pending)  |
| `chronometric.deadline_cluster_awareness` | boolean                                                                                                                                                      | `student-university`                      | consumed by task-fractionator (pending) |
| `chronometric.time_buffer_multiplier`     | number 1.0–3.0 (neutral default 1.0)                                                                                                                         | `dyspraxia` (1.3)                         | consumed by task-fractionator (pending) |
| `chronometric.motor_fatigue_aware`        | boolean                                                                                                                                                      | `dyspraxia`                               | consumed by mcp-chronometric (pending)  |

Notes:

- `motor_fatigue_aware` only declares the preference; actually reading motor
  activity is still gated by `privacy.os_idle_consent` and the relevant
  OS-input consents.
- `weekday_overrides` and the objects inside `protected_windows` reject unknown
  keys (a misspelt weekday or window field is almost always a typo that would
  silently do nothing); every other block stays forward-compatible
  (`additionalProperties: true`) per ADR 0004.

## Candidate fields for a future schema bump

Notes the presets surfaced during authoring; still tracked for a future
profile schema version:

- **Escalation-ladder shape override.** Today
  `chronometric.hyperfocus_break_minutes` re-anchors only the "nudge"
  rung; the 60/+30/+60 ladder shape is fixed. An ADHD or low-stimulation
  preset can't surface the gentle rung earlier than 60 minutes.
- **Per-guardrail override hints in the profile.** Currently the OCD and
  low-stimulation presets express their strictness through
  `sycophancy_check: refuse` plus tighter rumination numbers; there is
  no schema-level way to declare "always show the override path
  prominently in finality-mode output" — the skill copy carries that
  contract instead.
