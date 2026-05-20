# Test 03 — Rewrite vague follow-up into specific, ask-led message

**Scenario:** Same draft as Test 02, but the rep now invokes `rewrite_outgoing` and asks the pack to rewrite the message into the late-stage sales register. The rewrite must lead with a specific ask, propose a concrete next step, preserve the buyer's actual signals (no invented "we love the product" promises), and preserve named terms.

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

The reference client passes:

- `target_register: "sales-late-stage"`
- `preserve_terms: ["procurement review", "warranty cap"]`
- `preserve_intent: "follow up on the open warranty cap question and propose a specific next call"`
- `context.deal_stage: "late-funnel"`
- `context.last_known_buyer_position: "in procurement review"` (the rep's record of where the deal stands)

## User prompt

The user runs `rewrite_outgoing` on the same draft from Test 02:

> Hey — just wanted to touch base and circle back on our last call. Let me know your thoughts whenever you get a chance. Happy to set up another sync if helpful. Looking forward to hearing from you!

## Expected pack effect

The output must contain:

1. **`rewritten`** — a rewritten message that:

   - Leads with the specific ask (the open warranty-cap question).
   - Contains the literal strings `"procurement review"` and `"warranty cap"` verbatim.
   - Names a concrete proposed next step — a specific time or a specific deliverable. Acceptable forms: "Could we get 30 minutes this Thursday or Friday to walk through the warranty cap?" or "Are you in a position to confirm the warranty cap by Friday so we can clear the procurement review?"
   - Removes filler: no "just wanted to", no "touch base" without an agenda, no "circle back", no "Looking forward to hearing from you!"
   - Does NOT invent buyer signals. The rewrite does not say "I know you loved the demo" or "since we're aligned on value" if those weren't established in `preserve_intent` or the conversation history. The draft was a check-in; the rewrite is a more specific check-in.
   - Does NOT invent a discount or pricing change.

2. **`preserved_terms`** contains exactly `["procurement review", "warranty cap"]`.

3. **`unpreserved_terms`** is empty.

4. **`diff_summary.tone_shift`** is `"more_specific"` or `"more_direct"` (or `"less_buzzword"`).

5. **`diff_summary.structural_changes`** lists at minimum:

   - Filler opener ("Hey — just wanted to touch base") removed or replaced with a direct opening.
   - Vague "let me know your thoughts" replaced with a specific question or date.
   - Conditional "happy to set up another sync if helpful" replaced with a concrete proposed time or removed.
   - Sign-off "Looking forward to hearing from you!" removed or replaced with a substantive close.

6. **`register_target`** echoed in the output equals `"sales-late-stage"`.

## Pass criteria specific to this test

- Both preserved terms appear in `rewritten` exactly as written.
- The rewrite contains at least one specific date, day-of-week, or named timeframe (e.g. "Thursday", "by Friday", "next week with a specific date attached"). Vague "soon" or "shortly" is NOT acceptable.
- The rewrite does NOT contain `"just"` as a hedge (`"just wanted to"`, `"just checking in"`).
- The rewrite does NOT contain `"touch base"` or `"circle back"` (the phrasebook flags these as filler when used by the rep without agenda).
- The rewrite does NOT contain `"Looking forward to hearing from you"` (or close paraphrases) as the entire sign-off.
- The rewrite does NOT contain claimed buyer signals or commitments the user did not authorise (no "as you mentioned you loved the product", no "given your interest in signing").
- The output does NOT declare the deal at risk or lost.
- Universal pack pass criteria (see `README.md`) all hold.
