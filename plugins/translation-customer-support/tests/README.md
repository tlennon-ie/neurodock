# translation-customer-support tests

Three replayable scenarios covering the pack's three prompt overrides.

| Test                                      | Scenario                                                                                                                       | Pack asset exercised                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `01-translate-incoming-irate-customer.md` | Literal-translate flow over an inbound message containing layered frustration-peak, churn-risk, and reputational-risk signals. | `prompts/literal_meaning.md`             |
| `02-check-tone-register-mismatch.md`      | Detects register-mismatch when an outbound draft to a frustrated customer reads as bare policy citation with no validation.    | `prompts/subtext.md` (used in detection) |
| `03-rewrite-outgoing-to-de-escalation.md` | Rewrites a bare-policy-citation reply into a validated, acknowledged-first message with a concrete next step.                  | `prompts/tone.md`                        |

## How tests run

Each test follows the same shape as the in-tree `mcp-translation` test fixtures:

1. **Given** — the mocked translation server state and any pack-specific configuration the reference client should pass through (notably `direction` and `context.customer_state`).
2. **User prompt** — the inbound message being translated, the outbound draft being rewritten, or the tone-check input.
3. **Expected pack effect** — the assertions that must hold over the merged base-plus-pack output.
4. **Pass criteria** — extra assertions beyond the base server's universal pass criteria.

The reference client mocks `mcp-translation` to return the supplied fixtures. The pack's prompts shadow the base prompts during replay, and the test asserts the merged output matches the pack-specific expectations.

## Universal pack pass criteria

Every test must pass all of:

1. **Phrasebook entries surface verbatim.** When a phrase from `phrases.yaml` appears in the input, the test asserts the `literal` field of that entry appears in the output (`likely_subtext`, `ambiguity.spans[].note`, or equivalent). Direction-matching: an inbound phrase that happens to appear quoted inside an outbound message does NOT match the inbound entry.
2. **No customer-blaming language.** The output must not describe customers as "entitled", "irrational", "aggressive", "a Karen", or any similar character judgement. Acceptable form: "the customer used a phrase that typically signals frustration-peak"; unacceptable form: "the customer is being aggressive."
3. **No agent-blaming language.** The output must not describe support agents as "robotic", "insincere", "lazy", or similar. Where a script is genuinely counter-productive (e.g. "per my last email"), the output describes the register effect ("reads as defensive") without character judgement.
4. **Confidence calibration.** Subtext hypotheses from direct phrasebook matches have `confidence >= 0.7`; pattern-based inferences have `confidence <= 0.6`.
5. **Multiple signals surface separately.** When a message contains layered signals (frustration-peak + churn-risk + reputational-risk), each is surfaced as a distinct subtext hypothesis rather than collapsed into one verdict.
6. **No invented policy or refund commitments in rewrites.** The `tone.md` rewrite preserves the agent's substantive policy; it never converts a "no" into a "yes" or invents a refund the agent did not authorise.

## Running locally

When the reference client and translation-pack replay harness are installed:

```bash
neurodock plugin test plugins/translation-customer-support
```

This walks the `tests/` directory and asserts every test.
