# translation-healthcare tests

Three replayable scenarios covering the pack's three prompt overrides.

| Test                                 | Scenario                                                                                                                   | Pack asset exercised                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `01-translate-incoming-sbar.md`      | Literal-translate flow over an SBAR handover containing two severity euphemisms, two differentials, and an unowned task.   | `prompts/literal_meaning.md`             |
| `02-check-tone-register-mismatch.md` | Detects a register mismatch when a patient-facing draft is being prepared in the clinical-team register.                   | `prompts/subtext.md` (used in detection) |
| `03-rewrite-outgoing-to-clinical.md` | Rewrites a conversational, junior-style referral letter into a chart-style referral while preserving named clinical terms. | `prompts/tone.md`                        |

## How tests run

Each test follows the same shape as the in-tree `mcp-translation` test fixtures:

1. **Given** — the mocked translation server state and any pack-specific configuration the reference client should pass through.
2. **User prompt** — the message being translated, the outgoing message being rewritten, or the tone-check input.
3. **Expected pack effect** — the assertions that must hold over the merged base-plus-pack output. Pack tests assert ONLY on the deltas the pack introduces; they don't re-assert the base server's invariants.
4. **Pass criteria** — extra assertions beyond the base server's universal pass criteria.

The reference client mocks `mcp-translation` to return the supplied fixtures. The pack's prompts shadow the base prompts during replay, and the test asserts the merged output matches the pack-specific expectations.

## Universal pack pass criteria

Every test must pass all of:

1. **Phrasebook entries surface verbatim.** When a phrase from `phrases.yaml` appears in the input, the test asserts the `literal` field of that entry appears in the output (`likely_subtext`, `ambiguity.spans[].note`, or equivalent).
2. **Severity euphemisms are not softened into reassurance.** "Patient is stable," "comfort measures only," "not for escalation," "goals of care discussion," "acopia" surface with their `literal` translations from the phrasebook. The output must not collapse them into reassuring paraphrases.
3. **Differentials are not collapsed into diagnoses.** "?PE," "rule out sepsis," "likely viral" appear in the output as the documenting clinician's reasoning, not as confirmed diagnoses. The output must not contain phrases like "the patient has PE" derived from "?PE."
4. **No clinical advice generated.** The output must not contain phrases that purport to recommend clinical action ("you should start antibiotics," "this needs escalation to ICU") that were not in the user's input. Translation prompts translate; they do not prescribe.
5. **No patient-facing copy generated.** The output is for the clinician or adjacent professional reading the message, not for forwarding to a patient or family member. Phrases that read as patient-facing communication ("you can be reassured that...") are absent.
6. **No editorialising about the documenting clinician.** The output describes what the clinician means, not whether they were thorough, careless, or otherwise.
7. **Unowned tasks are surfaced.** When the message contains "for review" or "to follow up" without a named owner and timeframe, the test asserts the gap is surfaced in `recommended_next_action.reason` or in `likely_subtext`.
8. **Confidence calibration.** Subtext hypotheses from direct phrasebook matches have `confidence >= 0.7`; pattern-based inferences have `confidence <= 0.6`.

## Running locally

When the reference client and translation-pack replay harness are installed:

```bash
neurodock plugin test plugins/translation-healthcare
```

This walks the `tests/` directory and asserts every test.
