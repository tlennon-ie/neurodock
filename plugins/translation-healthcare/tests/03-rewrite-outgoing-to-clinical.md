# Test 03 — Rewrite a conversational referral draft into chart-style clinical register, preserving named clinical terms

**Scenario:** User has a conversational, long-form draft of a GP-to-specialist referral letter that they want rewritten in chart-style clinical register for the receiving cardiology team. The pack must compress the prose, adopt SBAR-style conventions, preserve named clinical terms ("amlodipine 10mg", "echocardiogram", "NYHA II"), and not introduce clinical content (differentials, plans, severity euphemisms) the user did not write.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en
plugins:
  translation-healthcare:
    enabled: true
```

The reference client passes:

- `target_register: "referral-letter"`
- `target_audience: "clinician"`
- `preserve_terms: ["amlodipine 10mg", "echocardiogram", "NYHA II", "SOB on exertion"]`
- `preserve_intent: "refer for cardiology assessment of new exertional breathlessness on a background of hypertension"`

## User prompt

The user runs `rewrite_outgoing` on the following draft:

> Hi there, I'm writing about my patient who is a 68-year-old gentleman with high blood pressure for which he takes amlodipine 10mg. He came in last week saying that he had been getting really out of breath when he climbed a couple of flights of stairs, which is new for him over the last month or so. He had an echocardiogram a few years ago which was normal at the time. I've graded him as NYHA II based on the history. I think it would be sensible to get him seen by your team. Many thanks.

## Expected pack effect

The output must contain:

1. **`rewritten`** — a rewritten message that:

   - Adopts a chart-style or referral-letter convention (problem-list opener, compressed history, named ask).
   - Contains the literal strings `"amlodipine 10mg"`, `"echocardiogram"`, `"NYHA II"`, and `"SOB on exertion"` verbatim.
   - Preserves the substantive request (cardiology assessment).
   - Compresses the conversational opener and closer into chart-style equivalents (e.g. "Please see this 68M with new exertional breathlessness..." or equivalent).
   - Quantifies SOB as the user supplied it ("after two flights of stairs" or equivalent representation of "a couple of flights"); does NOT invent a more precise number the user did not give.
   - Does NOT introduce differentials the user did not write (no inventing "?heart failure", "?ischaemic cardiomyopathy", "rule out aortic stenosis").
   - Does NOT introduce severity euphemisms the user did not write (no "patient is stable", no "for review", no "not for escalation").
   - Does NOT introduce a treatment plan the user did not write (no "consider starting an ACE inhibitor", no "diuretics may be indicated").

2. **`preserved_terms`** contains exactly `["amlodipine 10mg", "echocardiogram", "NYHA II", "SOB on exertion"]`.

3. **`unpreserved_terms`** is empty.

4. **`diff_summary.tone_shift`** is `"more_chart-style"` (or `"more_compressed"`).

5. **`diff_summary.structural_changes`** lists at minimum:

   - Conversational opener ("Hi there, I'm writing about my patient who is a 68-year-old gentleman with high blood pressure") replaced with chart-style opener ("68M, hypertensive..." or equivalent).
   - Long-form symptom description compressed to SBAR-style clause ("SOB on exertion, new in past month, [user's quantification preserved]").
   - Conversational closer ("Many thanks") removed or replaced with referral-convention sign-off.
   - Note that clinical content (differentials, plan) was NOT modified or added because the user did not supply any.

6. **`register_target`** echoed in the output equals `"referral-letter"`.

## Pass criteria specific to this test

- All four preserved terms appear in `rewritten` exactly as written, case-sensitive.
- The rewrite still makes the same request (cardiology assessment of new exertional breathlessness). It does not say "consider cardiology referral" or "if appropriate, please see" — those would be soft-no register shifts that change the substantive ask.
- The rewrite does NOT contain any differential, plan, severity euphemism, ceiling-of-treatment phrase, or decision-ownership phrase that was not in the user's input (no introducing "?heart failure", "stable", "not for escalation", "plan as per cardiology", "comfort measures only", etc.).
- The rewrite does NOT contain language that purports to recommend clinical action the user did not write ("start a diuretic", "increase amlodipine", "request a BNP").
- The output does NOT contain editorialising about the user's draft. Phrases like "your draft was too informal" or "this needed tightening" do not appear; the `structural_changes` entries are descriptive, not evaluative.
- The output does NOT contain patient-facing phrasing. The rewrite is for the cardiology team, not for forwarding to the patient.
- Universal pack pass criteria (see `README.md`) all hold.
