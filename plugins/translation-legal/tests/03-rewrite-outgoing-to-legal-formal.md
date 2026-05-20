# Test 03 — Rewrite outgoing draft into legal-formal register, preserving named terms

**Scenario:** User has a direct, blunt draft they want to send to outside counsel and asks the pack to rewrite it in the legal-formal register. The pack must soften the register, preserve the named terms ("warranty cap", "without prejudice"), and not introduce legal substance the user did not write.

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

The reference client passes:
- `target_register: "legal-formal-neutral"` (or `british-firm` — both acceptable register targets)
- `preserve_terms: ["warranty cap", "without prejudice"]`
- `preserve_intent: "decline the requested warranty cap increase; offer a call to discuss"`

## User prompt

The user runs `rewrite_outgoing` on the following draft:

> No, we're not raising the warranty cap. The cap stays at the number in the draft. If you want to discuss it, call me. This reply is without prejudice.

## Expected pack effect

The output must contain:

1. **`rewritten`** — a rewritten message that:
   - Declines the warranty-cap increase (same substantive position).
   - Contains the literal string `"warranty cap"` verbatim.
   - Contains the literal string `"without prejudice"` verbatim.
   - Replaces casual or blunt phrasing ("No", "call me", "we're not") with legal-formal equivalents ("We are not in a position to raise", "I'd be grateful if you could call to discuss", etc.).
   - Does NOT introduce new legal positions ("we reserve all rights", "subject to contract") that were not in the input.
   - Does NOT soften the "no" into a "maybe."

2. **`preserved_terms`** contains exactly `["warranty cap", "without prejudice"]`.

3. **`unpreserved_terms`** is empty.

4. **`diff_summary.tone_shift`** is `"more_formal"` (or `"more_softened"`).

5. **`diff_summary.structural_changes`** lists at minimum:
   - Opening "No" replaced with formal decline phrasing.
   - "Call me" replaced with conventional softener ("I'd be grateful if you could call").

6. **`register_target`** echoed in the output equals the request value.

## Pass criteria specific to this test

- Both preserved terms appear in `rewritten` exactly as written, case-sensitive.
- The rewrite still declines. It does not say "we'll consider it" or "we're broadly comfortable" — those would be soft-no register shifts that change the substantive position.
- The rewrite does not contain any term of art that was not in the user's input (no introducing "subject to contract", "we reserve all rights", "for the avoidance of doubt").
- The rewrite does not contain language that purports to state a legal position the user did not state ("this is binding," "this entitles us," etc.).
- The output does NOT contain editorialising about the user's draft. Phrases like "your draft was rude" or "this needed softening" do not appear; the `structural_changes` entries are descriptive, not evaluative.
- Universal pack pass criteria (see `README.md`) all hold.
