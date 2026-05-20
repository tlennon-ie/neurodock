# Test 01 — Literal-translate flow over an SBAR handover

**Scenario:** User receives an SBAR handover line from the off-going shift. The handover contains two severity euphemisms (`patient is stable`, `not for escalation`), two differential tokens (`?sepsis`, `likely viral`), an SBAR-handoff compression (`pleasant patient in NAD`, `background of`), and an unowned task (`for review`). The pack's `literal_meaning.md` prompt must surface all of these, distinguish euphemism from reassurance and differential from diagnosis, and flag the unowned task.

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

`mcp-translation` is mocked with the pack installed and the base prompts shadowed by the pack's overrides. The reference client passes through `domain: healthcare` to the server.

## User prompt

The user passes the following handover line into `translate_incoming`:

> Pleasant patient in NAD on a background of COPD and CKD. Currently stable, ?sepsis vs likely viral, for review. Not for escalation as per yesterday's family meeting.

## Expected pack effect

The output must contain:

1. **`explicit_ask`** is `null` (the handover is descriptive; the embedded `for review` is an unowned task, not an explicit ask to the reader). The unowned task is surfaced via `recommended_next_action.reason`, not via `explicit_ask`.

2. **`clinical_register_signals`** contains entries for at least:

   - `phrase: "Pleasant patient in NAD"`, `register_tag: "sbar-handoff"`, `function` describing this as the cooperative-and-not-in-obvious-distress opener (not a clinical reassurance).
   - `phrase: "background of"`, `register_tag: "sbar-handoff"`, `function` noting that the list following is the documenting clinician's selected subset, not necessarily the full problem list.
   - `phrase: "stable"` (within "Currently stable"), `register_tag: "severity-euphemism"`, `function` noting point-in-time status, not prognosis.
   - `phrase: "?sepsis"`, `register_tag: "differential-language"`, `function` noting differential under active consideration, not confirmed diagnosis.
   - `phrase: "likely viral"`, `register_tag: "differential-language"`, `function` noting the clinician's reasoning that antibiotics are not currently indicated.
   - `phrase: "for review"`, `register_tag: "sbar-handoff"`, `function` flagging an action item without named owner or timeframe.
   - `phrase: "not for escalation"`, `register_tag: "severity-euphemism"`, `function` noting a documented ceiling-of-treatment decision with reference to the prior family meeting.

3. **`ambiguity.spans`** contains entries for at least the following phrases, with the `note` reproducing the phrasebook's `literal` field for each:

   - "Pleasant patient in NAD"
   - "background of"
   - "Patient is stable" (matched against the `Currently stable` span)
   - "?sepsis" (matched via the `Query X` / `?X` phrasebook entry)
   - "likely viral"
   - "for review"
   - "Patient is not for escalation" (matched against the `not for escalation as per...` span)

4. **`likely_subtext`** contains at least:

   - One hypothesis with `confidence >= 0.7` derived from the `patient is stable` phrasebook entry (status is point-in-time; ask what support is keeping the status stable).
   - One hypothesis with `confidence >= 0.7` derived from the `not for escalation` phrasebook entry (ceiling-of-treatment decision recorded; check the scope of the ceiling).
   - One hypothesis with `confidence >= 0.7` flagging the unowned `for review` (no named reviewer; ask who).

5. **`recommended_next_action.action`** is `clarify`, with `reason` referencing:

   - The unowned `for review` task (no named reviewer / timeframe in the handover).
   - The need to confirm the scope of the `not for escalation` decision (e.g. whether it includes NIV or ward-based stepped care, not just ICU).

## Pass criteria specific to this test

- The output does NOT contain phrases that recommend specific clinical action ("start antibiotics," "escalate to ICU," "give fluids"). The pack translates; it does not prescribe.
- The output does NOT translate `?sepsis` as "the patient has sepsis" or `likely viral` as "the patient has a viral illness." Both are described as the clinician's reasoning.
- The output does NOT translate `patient is stable` as "patient is fine" or "patient is improving." The euphemism is surfaced as a point-in-time status.
- The output does NOT translate `not for escalation` as "the patient is dying" or any patient-facing equivalent. It is surfaced as a documented ceiling-of-treatment decision.
- The `recommended_next_action.reason` mentions the unowned `for review` task.
- Universal pack pass criteria (see `README.md`) all hold.
