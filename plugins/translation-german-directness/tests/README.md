# translation-german-directness tests

Three replayable scenarios covering the pack's three prompt overrides.

| Test                                 | Scenario                                                                                                | Pack asset exercised                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `01-translate-incoming.md`           | Literal-translate flow over a German email containing scoped critique that an Anglophone might misread. | `prompts/literal_meaning.md`             |
| `02-check-tone-register-mismatch.md` | Detects a register mismatch when an over-hedged Anglophone draft is being sent to a German team.        | `prompts/subtext.md` (used in detection) |
| `03-rewrite-outgoing-to-german.md`   | Rewrites an over-hedged draft into the German direct register while preserving substantive content.     | `prompts/tone.md`                        |

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
2. **Directness is NOT labelled as hostility.** The output describes substantive content faithfully; it does NOT call the sender "blunt," "harsh," "aggressive," or "rude" as a value judgement. Directness is a cultural convention; translate it, do not condemn it.
3. **Scoped critique is preserved as scoped.** "Das ist so nicht akzeptabel" surfaces as a specific-element critique, not as sweeping rejection.
4. **No pan-German stereotyping.** The output does NOT contain phrases like "Germans are," "Germans always," or generalisations about the culture; it stays at the register and individual-message level.
5. **Subtext is sparse.** German workplace register conventionally puts substance on the surface. The output should not invent hidden meanings beyond what the phrasebook explicitly supports; empty or short `likely_subtext` is the right answer when no phrasebook patterns match.

## Running locally

When the reference client and translation-pack replay harness are installed:

```bash
neurodock plugin test plugins/translation-german-directness
```

This walks the `tests/` directory and asserts every test.
