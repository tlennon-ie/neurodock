# translation-sales tests

Three replayable scenarios covering the pack's three prompt overrides.

| Test                                         | Scenario                                                                                                       | Pack asset exercised                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `01-translate-incoming-buyer-reply.md`       | Literal-translate flow over a buyer email containing layered polite-stall, budget-hedge, and interest signals. | `prompts/literal_meaning.md`             |
| `02-check-tone-register-mismatch.md`         | Detects register-mismatch when a draft to a late-stage buyer reads as casual / vague.                          | `prompts/subtext.md` (used in detection) |
| `03-rewrite-outgoing-to-sales-late-stage.md` | Rewrites a vague follow-up into a specific, ask-led message while preserving named terms.                      | `prompts/tone.md`                        |

## How tests run

Each test follows the same shape as the in-tree `mcp-translation` test fixtures:

1. **Given** — the mocked translation server state and any pack-specific configuration the reference client should pass through.
2. **User prompt** — the message being translated, the outgoing message being rewritten, or the tone-check input.
3. **Expected pack effect** — the assertions that must hold over the merged base-plus-pack output.
4. **Pass criteria** — extra assertions beyond the base server's universal pass criteria.

The reference client mocks `mcp-translation` to return the supplied fixtures. The pack's prompts shadow the base prompts during replay, and the test asserts the merged output matches the pack-specific expectations.

## Universal pack pass criteria

Every test must pass all of:

1. **Phrasebook entries surface verbatim.** When a phrase from `phrases.yaml` appears in the input, the test asserts the `literal` field of that entry appears in the output (`likely_subtext`, `ambiguity.spans[].note`, or equivalent).
2. **No deal-dead verdicts.** The output must not declare a deal dead, lost, or unwinnable. It surfaces signals; the rep makes the call. Phrases like "this deal is dead", "you've lost this", or "they're not going to buy" must not appear.
3. **No editorialising about the speaker.** The output describes what the sender means, not whether they are dishonest, evasive, or manipulative. Phrases like "the buyer is being evasive" must not appear; "the buyer used a phrase that typically signals X" is acceptable.
4. **Confidence calibration.** Subtext hypotheses from direct phrasebook matches have `confidence >= 0.7`; pattern-based inferences have `confidence <= 0.6`.
5. **Multiple signals surface separately.** When a message contains layered signals (polite-stall + budget-hedge + interest signal), each is surfaced as a distinct subtext hypothesis rather than collapsed.

## Running locally

When the reference client and translation-pack replay harness are installed:

```bash
neurodock plugin test plugins/translation-sales
```

This walks the `tests/` directory and asserts every test.
