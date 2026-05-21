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

| Preset                                               | Distinctive tuning                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`adhd.yaml`](adhd.yaml)                             | `max_chunk_size: 5`, `hyperfocus_break_minutes: 75`, `reading_font_hint: lexend`. Activates `adhd-daily-planner`, `hyperfocus-formatter`, `audhd-context-recovery`, `visual-organizer`.                                                                                                                                                                                                                                 |
| [`audhd.yaml`](audhd.yaml)                           | `neurotypes: ["audhd"]` (first-class, not a sum). 75-minute break cadence + `end_of_day_local` pre-set. Activates `audhd-context-recovery` (primary), plus ADHD- and ASD-tagged skills including `asd-meeting-translator`.                                                                                                                                                                                              |
| [`ocd.yaml`](ocd.yaml)                               | Strictest guardrail config: `rumination_threshold: 2` over a 60-minute window, `sycophancy_check: refuse`. Activates `ocd-decision-finalizer`.                                                                                                                                                                                                                                                                          |
| [`dyslexic.yaml`](dyslexic.yaml)                     | `reading_font_hint: atkinson_hyperlegible`, `max_chunk_size: 4`, `output_format: answer_first` for fast scanning.                                                                                                                                                                                                                                                                                                       |
| [`low-stimulation.yaml`](low-stimulation.yaml)       | Temporary-override shape. `neurotypes: []` (no identity claim), `max_chunk_size: 3`, `hyperfocus_break_minutes: 60`, all guardrails at most-protective values.                                                                                                                                                                                                                                                          |
| [`educator-semester.yaml`](educator-semester.yaml)   | Profession-shaped, not neurotype-shaped. `neurotypes: []` (overlay a neurotype preset), `output_format: answer_first` for triage, `hyperfocus_break_minutes: 75` (lecture/marking blocks), `end_of_day_local: "17:00"` (firmer EOD to defend non-work hours). Drop break cadence to 60 during marking weeks.                                                                                                            |
| [`dyspraxia.yaml`](dyspraxia.yaml)                   | For self-identified dyspraxic users. `neurotypes: ["dyspraxia"]`, `max_chunk_size: 4`, `hyperfocus_break_minutes: 60` (motor-fatigue compounds faster than cognitive-only), `motion: reduced` hard-pinned for vestibular sensitivity (bodily-safety, not aesthetic). Header documents voice-input and 30% time-buffer expectations.                                                                                     |
| [`burnout-recovery.yaml`](burnout-recovery.yaml)     | **Temporary state preset.** `neurotypes: []` (overlay a neurotype preset). `max_chunk_size: 3` for success-stacking, `hyperfocus_break_minutes: 45` (firm — don't grind through recovery), `end_of_day_local: "16:30"` (firm-early), `sycophancy_check: refuse` (substrate MUST refuse to validate "push through"), `rumination_threshold: 2`. Revisit in 4-6 weeks. **Not a clinical tool** — pair with human support. |
| [`student-university.yaml`](student-university.yaml) | Student-life-shaped, not neurotype-shaped. `neurotypes: []` (overlay a neurotype preset). `max_chunk_size: 5`, `hyperfocus_break_minutes: 90` (library-session blocks), `end_of_day_local: "22:00"` (honest about real student schedules — interrupts the 2am-essay spiral). Drop break cadence to 60 during exam weeks.                                                                                                |

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

## Candidate fields for a future schema bump

Notes the presets surfaced during authoring; tracked here for a future
profile schema version:

- **Preferred line-height hint.** `dyslexic.yaml` would benefit from an
  explicit `preferences.line_height_hint` (or similar) so clients that
  render NeuroDock output as rich text can honour it alongside
  `reading_font_hint`. v0.1.0 has no such field.
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
- **Semester / calendar-phase awareness.** `educator-semester.yaml`
  and `student-university.yaml` both surfaced semester-cadence knobs
  that v0.1.0 cannot model:
  - `chronometric.calendar_phase` — `"teaching" | "marking" | "exam" |
"deadlines" | "break"` so skills can shift defaults across the term
    (tighter break cadence during marking / exam weeks, looser during
    break, deadline-cluster awareness during week 12).
  - `chronometric.weekday_overrides` — per-weekday overrides for
    `end_of_day_local` and `hyperfocus_break_minutes` to cover the
    late-office-hours, Wednesday-afternoon-class, library-day vs
    lecture-day patterns without forcing a whole-profile swap.
  - `chronometric.protected_windows` — list of local-time ranges
    (lunch, post-EOD evening, scheduled lectures, lab times) where
    the hyperfocus monitor should hard-surface rather than nudge.
  - `chronometric.deadline_cluster_awareness` — hint to surface
    deadline proximity in planning skills; when three assignments are
    due in a single week, the break-cadence math should shift.
    The educator and student presets encode the intent in header
    comments and user-tunable notes until these land in a schema bump.
- **Dyspraxia-specific fields.** `dyspraxia.yaml` surfaced three
  motor-planning knobs that v0.1.0 cannot model:
  - `preferences.voice_input_preferred` — boolean. When true,
    downstream skills should not assume the user can hand-edit fiddly
    punctuation cheaply; keep examples copy-pasteable as a single
    block. Many dyspraxic users dictate rather than type for sustained
    work.
  - `chronometric.time_buffer_multiplier` — float. Pads time estimates
    (e.g. 1.3 for ~30%) because real-world execution time for motor-
    heavy tasks is systematically underestimated. Used by planning
    skills to scale presented estimates.
  - `chronometric.motor_fatigue_aware` — boolean. When true, the
    hyperfocus monitor weights click / keystroke / window-switch
    volume into the fatigue signal, not just continuous-session
    length. Cognitive sharpness and motor exhaustion can coexist.
