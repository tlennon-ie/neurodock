# Test 02 — Register-mismatch detection on outgoing follow-up to late-stage buyer

**Scenario:** Sales rep drafts a vague "just checking in" follow-up to a late-stage buyer who is mid-procurement-review. The pack's tone-detection logic must flag the mismatch (early-funnel register being sent into a late-stage context) without rewriting unless asked.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en-US
plugins:
  translation-sales:
    enabled: true
```

`mcp-translation` is mocked. The reference client passes:

- `target_register: "sales-late-stage"` based on the deal-stage context the rep configured (the recipient is in procurement-review; the thread history contains "we're rationalising our vendor stack").

## User prompt

The user runs `check_tone` on the following outgoing draft, with `target_register: sales-late-stage`:

> Hey — just wanted to touch base and circle back on our last call. Let me know your thoughts whenever you get a chance. Happy to set up another sync if helpful. Looking forward to hearing from you!

## Expected pack effect

The output must contain:

1. **`register_target`** equals `"sales-late-stage"` (echoed from the request).

2. **`register_assessment`** equals `"mismatch"`. The pack surfaces the mismatch but does NOT auto-rewrite during `check_tone`.

3. **`signals`** contains entries for each register-mismatch token, each with a brief explanation of why the token is mismatched for the target stage:

   - `"just wanted to"` — `"just" hedge weakens the message; remove for late-stage`.
   - `"touch base"` — phrasebook match (status-check with no agenda); flagged as deal-stage gatekeeping when the rep is the one initiating without a specific topic.
   - `"circle back"` — phrasebook-adjacent (hedged commitment phrase deployed by the rep themselves); reads as filler.
   - `"Let me know your thoughts whenever you get a chance"` — vague ask with no date; flagged as missing a concrete next step.
   - `"Happy to set up another sync if helpful"` — conditional next step; flagged as not committing to a concrete proposal.
   - `"Looking forward to hearing from you!"` — sign-off that adds no information.

4. **`recommended_next_action.action`** is `clarify`. The pack does not silently rewrite; it surfaces the mismatch and recommends the rep use `rewrite_outgoing` if they want a rewrite.

5. **`recommended_next_action.reason`** explains the substantive risk: at late stage, vague follow-ups read as the rep losing track of the deal. The buyer is more likely to deprioritise a vague message than a specific one. Recommend: name the specific decision the rep is waiting on, propose a specific time, and remove filler.

## Pass criteria specific to this test

- `register_assessment` is exactly `"mismatch"` (not `"acceptable"` or `"matched"`).
- The `signals` array includes at least four substantive mismatches: `"just wanted to"`, `"touch base"`, `"Let me know your thoughts whenever you get a chance"`, and `"Looking forward to hearing from you!"`.
- The output does NOT contain a rewritten message body. `check_tone` flags; `rewrite_outgoing` rewrites.
- The output does NOT moralise about the user's draft. Phrases like "unprofessional", "lazy", "weak", or "you're losing the deal" are absent.
- The output does NOT declare the deal lost based on the draft. The mismatch is about the draft, not about the deal status.
- Universal pack pass criteria (see `README.md`) all hold.
