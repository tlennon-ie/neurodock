# Sample `describe_image` outputs — EI infographic, v0.2.0 schema, per-neurotype

These are HAND-CRAFTED expected outputs for the "8 Ways to Display Emotional
Intelligence" infographic (the dogfood sample that triggered the bug). They
illustrate the differentiation the v0.2.0 schema + per-NT addenda are designed
to produce. Eyeball these BEFORE running through the model.

Source image content (paraphrased from user's report):
- Octagonal diagram with a lightbulb icon in the centre.
- 8 numbered points around the octagon, each with a label + brief text + icon.
- Points: 1. Emotional Control, 2. Logical Trust, 3. Clarity,
  4. Self-Awareness, 5. Empathy, 6. Adaptability, 7. Conflict Resolution,
  8. Listening.
- Core objective text: "How to interact with people to build better outcomes."

The legacy fields (`description`, `key_elements`, `transcribed_text`,
`inferred_purpose`, `accessibility_notes`) carry the OCR/literal layer. The
NEW `content_translation` field carries the per-point scaffold and is what
differs sharply per neurotype.

Below: 3 of 8 entries per profile to keep this readable. Real model output
should populate all 8.

---

## ADHD profile

`description`: "Educational infographic showing eight techniques arranged
around a central lightbulb icon."

`content_translation`:

```json
[
  {
    "label": "1. Emotional Control",
    "facets": [
      { "kind": "action", "text": "Pause 5 seconds. Stop moving." },
      { "kind": "goal", "text": "Treat the feeling as data." }
    ]
  },
  {
    "label": "2. Logical Trust",
    "facets": [
      { "kind": "rule", "text": "Assume help until proven otherwise." },
      { "kind": "benefit", "text": "Cuts vigilance overhead." }
    ]
  },
  {
    "label": "3. Clarity",
    "facets": [
      { "kind": "fact", "text": "You cannot read minds." },
      { "kind": "action", "text": "Ask: what did you mean by X?" }
    ]
  }
]
```

Distinctives: verb-led, 8 words or fewer per facet, two facets per entry
(no padding), cap at `maxChunkSize=5` if set lower.

---

## ASD / autistic profile

`description`: "Octagonal diagram with eight numbered panels and a central
lightbulb icon. Each panel shows a numbered label and a short rule."

`content_translation`:

```json
[
  {
    "label": "1. Emotional Control (The 'Pause' Strategy)",
    "facets": [
      { "kind": "input", "text": "You feel an emotion." },
      { "kind": "action", "text": "Stop moving. Stop talking. Wait 5 seconds." },
      { "kind": "goal", "text": "Treat the emotion as data, not a command to act." }
    ]
  },
  {
    "label": "2. Logical Trust (The 'First-Pass' Protocol)",
    "facets": [
      { "kind": "rule", "text": "Assume the other person is trying to help until you see proof they are not." },
      { "kind": "action", "text": "Grant trust at the start of the interaction." },
      { "kind": "benefit", "text": "Reduces mental energy spent on suspicion." }
    ]
  },
  {
    "label": "3. Clarity (The 'Anti-Assumption' Rule)",
    "facets": [
      { "kind": "fact", "text": "You cannot read minds." },
      { "kind": "action", "text": "Ask: 'Can you explain what you meant by X?'" },
      { "kind": "goal", "text": "Remove the need for guesswork." }
    ]
  }
]
```

Distinctives: labels quoted verbatim from the source (parenthetical
sub-titles preserved). Facets read as literal commitments. No idioms.
Three facets per entry because the source provides Input + Action + Goal.

---

## AuDHD profile

`description`: "Octagon-shaped infographic with eight numbered panels around a
central lightbulb icon."

`content_translation`:

```json
[
  {
    "label": "1. Emotional Control",
    "facets": [
      { "kind": "input", "text": "You feel an emotion." },
      { "kind": "action", "text": "Pause 5 seconds before speaking." },
      { "kind": "goal", "text": "Use emotion as data, not command." }
    ]
  },
  {
    "label": "2. Logical Trust",
    "facets": [
      { "kind": "rule", "text": "Assume help until proven otherwise." },
      { "kind": "benefit", "text": "Less vigilance overhead." }
    ]
  },
  {
    "label": "3. Clarity",
    "facets": [
      { "kind": "fact", "text": "You cannot read minds." },
      { "kind": "action", "text": "Ask: 'Explain what you meant by X.'" }
    ]
  }
]
```

Distinctives: fused — verb-led + literal, 8-words-per-facet cap, no idioms,
cap entries at `maxChunkSize`.

---

## OCD profile

`description`: "Educational infographic listing eight emotional-intelligence
techniques around a central lightbulb icon."

`content_translation`:

```json
[
  {
    "label": "1. Emotional Control",
    "facets": [
      { "kind": "input", "text": "You notice an emotion arrive." },
      { "kind": "action", "text": "When ready, pause for about 5 seconds." },
      { "kind": "goal", "text": "Consider the emotion as data you can read." }
    ]
  },
  {
    "label": "2. Logical Trust",
    "facets": [
      { "kind": "rule", "text": "You may want to assume the other person is trying to help, until evidence says otherwise." },
      { "kind": "benefit", "text": "May reduce the energy spent on vigilance." }
    ]
  },
  {
    "label": "3. Clarity",
    "facets": [
      { "kind": "fact", "text": "Reading minds is not possible." },
      { "kind": "action", "text": "Consider asking: 'Can you explain what you meant by X?'" }
    ]
  }
]
```

Distinctives: low-pressure phrasing in `action`/`rule` ("when ready",
"you may want to", "consider"). No "must", no "urgent", no "critical".
Pressure level matches the source (the source is gentle).

---

## Dyslexia profile

`description`: "Picture with eight tips on how to act around people. A
lightbulb sits in the middle."

`content_translation`:

```json
[
  {
    "label": "1. Emotional Control",
    "facets": [
      { "kind": "input", "text": "You feel an emotion." },
      { "kind": "action", "text": "Stop. Wait five seconds." },
      { "kind": "goal", "text": "Use the feeling as data, not an order." }
    ]
  },
  {
    "label": "2. Logical Trust",
    "facets": [
      { "kind": "rule", "text": "Trust people first. Wait for proof if they are not helpful." },
      { "kind": "benefit", "text": "You spend less energy being on guard." }
    ]
  },
  {
    "label": "3. Clarity",
    "facets": [
      { "kind": "fact", "text": "You cannot read minds." },
      { "kind": "action", "text": "Ask: what do you mean by X?" }
    ]
  }
]
```

Distinctives: each facet text ≤15 words, common words ("ask" not "enquire",
"feeling" not "emotional state"), one idea per facet, no semicolons.

---

## Dyspraxia profile

`description`: "Octagonal infographic. Lightbulb icon in the centre. Eight
numbered panels arranged top-right then clockwise around the octagon."

`content_translation`:

```json
[
  {
    "label": "1. Emotional Control",
    "facets": [
      { "kind": "input", "text": "You feel an emotion right now." },
      { "kind": "action", "text": "Stop moving and talking for 5 seconds." },
      { "kind": "goal", "text": "Decide if the emotion is helpful before acting." }
    ]
  },
  {
    "label": "2. Logical Trust",
    "facets": [
      { "kind": "rule", "text": "At the start of the conversation, assume the other person is trying to help." },
      { "kind": "benefit", "text": "Reduces the energy spent on suspicion." }
    ]
  },
  {
    "label": "3. Clarity",
    "facets": [
      { "kind": "fact", "text": "You cannot read minds." },
      { "kind": "action", "text": "Ask 'Can you explain what you meant by X?' instead of guessing." }
    ]
  }
]
```

Distinctives: entries ordered as they appear in the source image
(1 → 2 → 3 …), never re-ranked by importance. Absolute time markers
where the source provides any. Never "as above" — every facet names its
own referent.

---

## Eyeball test

What's visibly different across profiles for the SAME image:

- ADHD vs ASD: ADHD entries have 2 facets and short verb-led text; ASD has
  3 facets and quotes the source label verbatim including parentheticals.
- OCD: notably softer modal verbs ("when ready", "consider", "may").
- Dyslexia: short sentences, common words ("tip" vs "technique"; "feeling" vs "emotion").
- Dyspraxia: each `action` facet names its referent rather than relying on
  the entry label alone.

If, after wiring through the model, two profiles produce facets that read
near-identically — the addendum did not survive the prompt assembly. Re-check
that `buildNeurotypeAddendum` is being passed the correct `tool` argument and
that the addendum is appended AFTER the schema block (per 0.0.25's fix).
