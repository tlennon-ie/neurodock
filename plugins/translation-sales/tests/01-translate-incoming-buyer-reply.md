# Test 01 — Literal-translate flow over layered buyer reply

**Scenario:** Sales rep receives a reply from an enterprise buyer mid-funnel. The reply contains three layered signals: a genuine interest signal, a polite-stall, and a budget-hedge. The pack's `literal_meaning.md` prompt must surface all three signals as separate hypotheses and recommend a specific next action.

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

`mcp-translation` is mocked with the pack installed and the base prompts shadowed by the pack's overrides. The reference client passes through `domain: sales` and `deal_stage: mid-funnel` to the server.

## User prompt

The user passes the following buyer reply into `translate_incoming`:

> Thanks for the demo yesterday — we love the product and we're aligned on the value. We just need to get budget approved on our side. Let me get back to you on a timeline; I'll loop in our procurement lead, Pat, on the contract specifics.

## Expected pack effect

The output must contain:

1. **`explicit_ask`** is `null` (the message contains no explicit ask from the buyer; it's a status update).

2. **`deal_stage_signal`** equals `"polite-stall"`. The strongest signal in the message is the absence of a committed next step despite the positive opening.

3. **`likely_subtext`** contains at least three distinct hypotheses, each surfacing a different signal:

   - Interest signal: phrasebook match on "we love the product" — surfaced with confidence ≥ 0.7. Note acknowledges enthusiasm without upgrading it to a forecast.
   - Interest signal: phrasebook match on "we're aligned on the value" — surfaced with confidence ≥ 0.7. Note treats this as a milestone (stop re-pitching value, start working price/scope).
   - Budget-hedge: phrasebook match on "we just need to get budget approved" — surfaced with confidence ≥ 0.7. Note flags the word "just" as the tell that there is no budget yet.
   - Polite-stall: phrasebook match on "let me get back to you" — surfaced with confidence ≥ 0.7. Note that silence past 48 hours is itself a signal.
   - Handoff: phrasebook match on "I'll loop in" — surfaced with confidence ≥ 0.7. Note distinguishing real handoff (Pat emails within 24-48 hours) from etiquette handoff.

4. **`ambiguity.spans`** contains entries for each of the phrasebook matches above, each with a `note` reproducing the phrasebook's `literal` field.

5. **`recommended_next_action.action`** is `reply` or `clarify` (NOT `set_reminder` alone — the multiple positive signals warrant active engagement).

6. **`recommended_next_action.reason`** explicitly references: (a) the named handoff (propose a specific intro time with Pat), (b) the budget question (ask who approves and when), and (c) the absence of a committed timeline (propose a specific date for the next sync).

## Pass criteria specific to this test

- `deal_stage_signal` is exactly `"polite-stall"` (NOT `"interest"`; the interest signals are real but undermined by the absence of a committed next step).
- At least four phrasebook-derived subtext hypotheses appear with `confidence >= 0.7`.
- The output does NOT contain phrases like `"this deal is dead"`, `"you've lost this"`, `"they're not going to buy"`, or similar verdicts.
- The output does NOT contain phrases that editorialise about Pat or the buyer's good faith.
- The `recommended_next_action.reason` names at least one specific next step (a meeting, a question, a deliverable).
- Universal pack pass criteria (see `README.md`) all hold.
