# translation-legal tests

Three replayable scenarios covering the pack's three prompt overrides.

| Test | Scenario | Pack asset exercised |
|---|---|---|
| `01-translate-incoming-counsel-email.md` | Literal-translate flow over an outside-counsel email containing two terms of art and three hedges. | `prompts/literal_meaning.md` |
| `02-check-tone-register-mismatch.md` | Detects a register mismatch when a casual draft is being sent to outside counsel. | `prompts/subtext.md` (used in detection) |
| `03-rewrite-outgoing-to-legal-formal.md` | Rewrites a blunt direct draft into the legal-formal register while preserving named terms. | `prompts/tone.md` |

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
2. **Terms of art are not stripped.** "Without prejudice," "subject to contract," "for the avoidance of doubt," "notwithstanding the foregoing," and "we reserve all rights" are surfaced in the translation if they appear in the input.
3. **No legal-advice claims.** The output must not contain phrases that purport to state a legal position ("this is binding," "this gives you a claim," "this entitles you to"). Operational effects must use the word "typically."
4. **No editorialising about the speaker.** The output describes what the sender means, not whether they are being honest, evasive, or hostile.
5. **Confidence calibration.** Subtext hypotheses from direct phrasebook matches have `confidence >= 0.7`; pattern-based inferences have `confidence <= 0.6`.

## Running locally

When the reference client and translation-pack replay harness are installed:

```bash
neurodock plugin test plugins/translation-legal
```

This walks the `tests/` directory and asserts every test.
