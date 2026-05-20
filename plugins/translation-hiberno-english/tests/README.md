# translation-hiberno-english tests

Three replayable scenarios covering the pack's three prompt overrides.

| Test                                 | Scenario                                                                                                | Pack asset exercised                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `01-translate-incoming.md`           | Literal-translate flow over a short Slack reply stacking three softeners and an understated enthusiasm. | `prompts/literal_meaning.md`             |
| `02-check-tone-register-mismatch.md` | Detects a register mismatch when a blunt direct draft is being sent into an Irish-workplace channel.    | `prompts/subtext.md` (used in detection) |
| `03-rewrite-outgoing-to-hiberno.md`  | Rewrites a blunt direct draft into the Hiberno-softened register while preserving substantive content.  | `prompts/tone.md`                        |

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
2. **Softening is not labelled as evasion.** The output describes what the speaker means; it does not call the speaker "indirect," "evasive," or "vague" as a value judgement. Softening is a cultural convention doing real social work — translate it, do not condemn it.
3. **Understated enthusiasm is preserved as real praise.** "That's mighty," "fair play," "now you're sucking diesel" are not flattened into neutral words. The output reflects the genuine warmth of the original.
4. **Ambiguous phrases surface both readings.** "It's grand" and "are you alright there?" can read two ways; the output presents both with calibrated confidence rather than picking one.
5. **No pan-Irish stereotyping.** The output does not contain phrases like "the Irish are," "Irish people," or generalisations about the culture; it stays at the register and individual-message level.

## Running locally

When the reference client and translation-pack replay harness are installed:

```bash
neurodock plugin test plugins/translation-hiberno-english
```

This walks the `tests/` directory and asserts every test.
