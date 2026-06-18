---
"@neurodock/extension-browser": minor
---

feat(extension): tourette prompt addendum (r3) + voice_input_preferred and line_height_hint consumption (r5)

three additive, opt-in signals. a profile that declares none of them produces
exactly the pre-change behaviour (covered by back-compat tests).

- **tourette addendum (r3):** `tourette` was an explicit no-op in the
  per-neurotype prompt shaping. reviewed against the new `tourette-advocate`
  lens, it now gets a genuine, concise text-shaping block: be answer-first
  (less time held under attention + suppression load), plain and low-pressure,
  with no reassuring/soothing/motivational register and no commentary on the
  reader's behaviour, focus, or composure. the block is tool-independent and
  fuses correctly with the existing audhd/overlap logic.
- **voice_input_preferred (r5):** when set, the prompt builder appends a
  cross-cutting line (regardless of neurotype) asking downstream prose to keep
  any example, draft, or snippet as a single copy-pasteable block — dictation
  and motor users cannot cheaply hand-edit punctuation scattered across a
  response.
- **line_height_hint (r5):** the band (`compact` | `default` | `relaxed`) now
  drives the body line-height of rendered output across the popup, full-page
  tab, and in-page island via a single `lh-*` class and a new
  `--nd-body-line-height` token. mapping: compact = 1.5, default = 1.6,
  relaxed = 1.75 — never below the wcag 1.4.8 / 1.4.12 conformance floor of
  1.5 for any band. body paragraphs read `--nd-body-line-height` with a
  fallback to `--nd-line-height`, and focus-mode (1.45) was reconciled so it
  only re-binds ui-chrome line-height and can never combine with a set hint to
  pull a body paragraph below 1.5 (the in-page island's focus-mode panel rule
  was removed for the same reason). as a result, un-hinted island body
  paragraphs now floor at 1.5 under focus-mode (previously 1.45, which was
  below the wcag body floor).

both new fields flow through the extension profile and the native-host on-disk
mapping (`preferences.voice_input_preferred`, `preferences.line_height_hint`)
as optional keys — they are only written to disk when the user sets them.
