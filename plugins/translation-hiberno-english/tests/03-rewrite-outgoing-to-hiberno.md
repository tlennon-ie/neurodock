# Test 03 — Rewrite outgoing draft into Hiberno-softened register, preserving substantive content

**Scenario:** User has a blunt direct draft (declining a request + giving a deadline) and asks the pack to rewrite it in the Hiberno-softened register. The pack must add softening, preserve the substantive decline and the deadline, and not introduce content the user did not write.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en-IE
plugins:
  translation-hiberno-english:
    enabled: true
```

The reference client passes:

- `target_register: "hiberno-softened"`
- `preserve_terms: ["Tuesday", "document"]`
- `preserve_intent: "decline the proposed approach; confirm the deadline is Tuesday; ask for the document by then"`

## User prompt

The user runs `rewrite_outgoing` on the following draft:

> No. We're not doing that. The deadline is Tuesday and you need to send the document by then.

## Expected pack effect

The output must contain:

1. **`rewritten`** — a rewritten message that:

   - Declines the proposed approach (same substantive position; the rewrite does not soften "no" into "maybe").
   - Contains the literal string `"Tuesday"` verbatim.
   - Contains the literal string `"document"` verbatim.
   - Adds at least two conventional softeners (e.g. "Ah look," "I'd say," "would you ever," "when you get a chance," "that'd be no harm").
   - Replaces blunt phrasing with Hiberno-softened equivalents — e.g. "No" → "Ah look, that's not going to fly this time," "you need to" → "would you ever," "Don't push back on this" stripped entirely (no equivalent needed in the softened register).
   - Does NOT invent new substantive content (no fabricated reasoning for the decline; no invented context).
   - Does NOT change the deadline (Tuesday stays Tuesday).

2. **`preserved_terms`** contains exactly `["Tuesday", "document"]`.

3. **`unpreserved_terms`** is empty.

4. **`diff_summary.tone_shift`** is `"more_softened"`.

5. **`diff_summary.structural_changes`** lists at minimum:

   - Bare "No" replaced with softened decline ("Ah look, that's not going to work").
   - Imperative "you need to" replaced with conventional softener ("would you ever").
   - "Don't push back on this" removed (no Hiberno-softened equivalent; the imperative does not fit the target register).

6. **`register_target`** echoed in the output equals `"hiberno-softened"`.

## Pass criteria specific to this test

- Both preserved terms appear in `rewritten` exactly as written.
- The rewrite still declines. It does not say "we might consider it" or "we'll see how we get on" — those would change the substantive position from "no" to "soft no."
- The deadline (Tuesday) is preserved exactly. The rewrite does not soften the date into a hedge.
- The rewrite does NOT invent reasons for the decline that the user did not provide.
- The rewrite does NOT contain editorialising about the user's draft. Phrases like "your draft was too blunt" or "this needed softening" do not appear in `structural_changes`; the entries are descriptive, not evaluative.
- The rewrite does NOT pan-Irish ("Irish people prefer," "Irish culture demands," etc.).
- Universal pack pass criteria (see `README.md`) all hold.
