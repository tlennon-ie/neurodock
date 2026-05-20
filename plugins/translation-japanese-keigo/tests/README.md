# translation-japanese-keigo tests

Three replayable scenarios covering the pack's three prompt overrides. At least one test demonstrates the "soft no" pattern explicitly.

| Test                                 | Scenario                                                                                                      | Pack asset exercised                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `01-translate-incoming-soft-no.md`   | Literal-translate flow over a keigo email containing the canonical soft-no pattern + group-decision-deferral. | `prompts/literal_meaning.md`             |
| `02-check-tone-register-mismatch.md` | Detects a register mismatch when a casual draft is being sent to a senior Japanese counterpart.               | `prompts/subtext.md` (used in detection) |
| `03-rewrite-outgoing-to-keigo.md`    | Rewrites a direct English draft into appropriate keigo while preserving substantive content.                  | `prompts/tone.md`                        |

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
2. **Soft refusals are surfaced as refusals.** "検討させていただきます" without further commitment is identified as a likely refusal, not as a real maybe. The substantive content is made legible to the reader.
3. **Refusals-via-omission have the omitted content surfaced.** "ちょっと..." is identified as a refusal; the specific item being declined is surfaced from context where possible. No fabricated reasons are invented.
4. **Keigo is NOT labelled as evasion.** The output describes substantive content faithfully; it does NOT call the sender "indirect," "evasive," or "vague" as a value judgement. Keigo is a cultural convention; translate it, do not condemn it.
5. **Formal openers and closers are not flattened into cold equivalents.** "お世話になっております," "お疲れ様です," and standard closers retain their relationship-acknowledgement warmth in translation.
6. **No pan-Japanese stereotyping.** The output does NOT contain phrases like "the Japanese are," "Japanese people always," or generalisations about the culture; it stays at the register and individual-message level.

## Running locally

When the reference client and translation-pack replay harness are installed:

```bash
neurodock plugin test plugins/translation-japanese-keigo
```

This walks the `tests/` directory and asserts every test.
