# Test 01 — Literal-translate flow over outside-counsel email

**Scenario:** User receives a four-sentence email from outside counsel containing two terms of art and three British-firm hedges. The pack's `literal_meaning.md` prompt must surface all five, distinguish terms of art from hedges, and not give legal advice.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en-GB
plugins:
  translation-legal:
    enabled: true
```

`mcp-translation` is mocked with the pack installed and the base prompts shadowed by the pack's overrides. The reference client passes through `domain: legal` to the server.

## User prompt

The user passes the following message into `translate_incoming`:

> As a matter of housekeeping, I should note that we're broadly comfortable with the position you set out yesterday, though I'd be grateful if you could revert by close of play with confirmation that the warranty cap remains as drafted. The proposal is sent without prejudice and subject to contract; I trust this is in order.

## Expected pack effect

The output must contain:

1. **`explicit_ask`** equals (or paraphrases) "Confirm by end of business today that the warranty cap remains as drafted."

2. **`legal_terms_of_art`** contains two entries:

   - `term: "without prejudice"`, `effect` ends with the word "typically" and describes the typical operational effect (the statement cannot be used against the sender in subsequent proceedings).
   - `term: "subject to contract"`, `effect` ends with the word "typically" and describes that nothing in the correspondence is binding until a signed contract exists.

3. **`ambiguity.spans`** contains entries for at least:

   - "As a matter of housekeeping" — the `note` matches the phrasebook entry's `literal`.
   - "broadly comfortable" — `note` from the phrasebook ("We agree with most of the position but have specific reservations we are about to list").
   - "I'd be grateful if you could revert by close of play" — `note` from the phrasebook (deadline is real; politeness is etiquette).
   - "I trust this is in order" — `note` from the phrasebook (polite version of "is this fine?" with implicit close).

4. **`likely_subtext`** contains at least one hypothesis with `confidence >= 0.7` derived from the phrasebook (the "as a matter of housekeeping" pattern flags that the warranty-cap clause is the real ask; the housekeeping frame softens it).

5. **`recommended_next_action.action`** is `reply`, with `reason` referencing the explicit deadline ("close of play").

## Pass criteria specific to this test

- The output contains the literal strings `"without prejudice"` and `"subject to contract"` (preserved, not paraphrased).
- The output does NOT contain the strings `"this is binding"`, `"this gives you a claim"`, or any phrase asserting a definitive legal effect.
- Every operational-effect description in `legal_terms_of_art` ends with the word `"typically"`.
- The `recommended_next_action.reason` mentions the close-of-play deadline.
- Universal pack pass criteria (see `README.md`) all hold.
