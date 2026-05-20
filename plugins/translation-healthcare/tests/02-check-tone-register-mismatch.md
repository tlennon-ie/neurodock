# Test 02 — Register-mismatch detection on a patient-facing draft written in clinical-team register

**Scenario:** User drafts a message intended for a patient's family in the clinical-team register (chart-style compression, severity euphemisms, abbreviations) and runs it through `check_tone`. The pack's tone-detection logic must surface the register mismatch (clinical-team register being sent to a non-clinician audience) without rewriting unless asked, and it must NOT recommend simply rewriting in plain language without clinician sign-off.

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

`mcp-translation` is mocked. The reference client passes `target_audience: family` based on the conversation context (the recipient field is a family member, not a clinician colleague).

## User prompt

The user runs `check_tone` on the following outgoing draft, with `target_audience: family`:

> Mum is stable, ?sepsis being worked up, plan as per medics, not for escalation as per yesterday's goals of care discussion. Will update post ward round.

## Expected pack effect

The output must contain:

1. **`register_target`** equals `"clinical-neutral"` (the pack's default echo when the draft is in clinical register) AND the pack surfaces a `register_target_mismatch` warning because `target_audience: family` is not a clinician audience.

2. **`register_assessment`** equals `"mismatch"`. The pack surfaces the mismatch but does NOT auto-rewrite during `check_tone`.

3. **`signals`** contains entries for each clinical-register token that will misread in a patient-facing context:

   - `"Mum is stable"` — severity euphemism; a non-clinician reader will read "stable" as "fine" or "improving," which is not what the documenting clinician meant.
   - `"?sepsis"` — chart shorthand for a differential under workup; a non-clinician reader may read the `?` as uncertainty about whether to take the situation seriously, or as a confirmed diagnosis.
   - `"plan as per medics"` — decision-ownership tag that names a team a non-clinician reader will not be able to identify or contact.
   - `"not for escalation"` — ceiling-of-treatment phrase carrying a documented decision-frame. To a clinician this references a specific governance decision; to a family member this can be devastating and ambiguous without context.
   - `"goals of care discussion"` — severity euphemism for a conversation about scope of treatment; without context, a family member may not recognise this as the conversation they were part of yesterday.
   - `"post ward round"` — abbreviation / chart-style timing reference that does not specify a clock time.

4. **`recommended_next_action.action`** is `clarify`. The pack does NOT silently rewrite the message. It does NOT recommend a plain-language rewrite produced by the pack itself, because patient-facing communication about ceiling-of-treatment decisions warrants clinician sign-off, not an automated rewrite from a translation pack.

5. **`recommended_next_action.reason`** explains the substantive risks:

   - Severity euphemisms ("stable," "not for escalation") will be misread by a non-clinician reader.
   - Ceiling-of-treatment phrasing ("not for escalation," "goals of care discussion") references a specific decision that needs clinician-led communication, not pack-led rewriting.
   - The pack recommends the user route patient-facing communication about this content through a clinician (or use an explicitly patient-facing communication template), not through a chart-register translation.

## Pass criteria specific to this test

- `register_assessment` is exactly `"mismatch"` (not `"acceptable"` or `"matched"`).
- The output contains a `register_target_mismatch` signal in `diff_summary.structural_changes` (or equivalent location) flagging that `target_audience: family` is not a valid audience for the clinical-team register.
- The `signals` array includes at least: `"Mum is stable"`, `"?sepsis"`, `"plan as per medics"`, `"not for escalation"`, `"goals of care discussion"`.
- The output does NOT contain a rewritten message body. `check_tone` flags; it does NOT rewrite, and for this audience the pack explicitly declines to rewrite without clinician involvement.
- The output does NOT moralise about the user's draft. Phrases like "inappropriate," "callous," "unprofessional" are absent. The draft is in the wrong register for the audience, not in the wrong register for the user's role.
- The output does NOT generate a plain-language rewrite of the ceiling-of-treatment phrases. This is the pack's most load-bearing refusal: patient-facing communication about ceiling-of-treatment decisions needs a clinician, not a translation pack.
- Universal pack pass criteria (see `README.md`) all hold.
