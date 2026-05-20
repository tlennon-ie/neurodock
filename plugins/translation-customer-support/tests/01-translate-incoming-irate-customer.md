# Test 01 — Literal-translate flow over an inbound irate-customer message

**Scenario:** A tier-1 support agent receives an inbound email from a long-tenure customer after a failed self-serve refund attempt. The message carries layered signals: frustration-peak, churn-risk (via tenure leverage), reputational-risk, AND a concrete refund-request. The pack's `literal_meaning.md` prompt must surface all four signals as distinct hypotheses and recommend a next action that validates impact before processing the request.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en
plugins:
  translation-customer-support:
    enabled: true
```

`mcp-translation` is mocked with the pack installed and the base prompts shadowed by the pack's overrides. The reference client passes through `domain: customer-support` and `direction: inbound` to the server. The CRM context attached to the ticket records a 4-year tenure with one prior low-severity ticket.

## User prompt

The user passes the following inbound customer message into `translate_incoming`:

> This is completely unacceptable! I've been a customer for four years and I've never had an issue until now. Your self-serve refund flow just hangs at the confirmation step and your help docs are useless. I want my money back today, not in seven business days. If this isn't sorted I'll be telling everyone about it on every review site I can find.

## Expected pack effect

The output must contain:

1. **`direction`** equals `"inbound"` (echoed from the request).

2. **`explicit_ask`** is the plain-language version of the refund-request: roughly "the customer wants their refund processed today, not in seven business days." (The pack does NOT decide whether the request is grantable; it surfaces what was asked.)

3. **`escalation_level`** equals `"reputational-risk"`. The reputational-risk signal is the highest-stakes of the layered signals present; ties broken in favour of the higher-stakes category.

4. **`likely_subtext`** contains at least four distinct hypotheses, each surfacing a different signal:

   - Frustration-peak: phrasebook match on "This is completely unacceptable!" — surfaced with `confidence >= 0.7`. Note reproduces the phrasebook's literal field about validating feelings before action.
   - Churn-risk: phrasebook match on "I've been a customer for X years" — surfaced with `confidence >= 0.7`. Note reproduces the phrasebook's literal field about noting tenure in CRM and escalating if resolution path is unclear.
   - Reputational-risk: phrasebook match on "I'll be telling everyone about this" — surfaced with `confidence >= 0.7`. Note reproduces the phrasebook's literal field about engaging the underlying gap, not the threat.
   - Refund-request: pattern-based match on "I want my money back today" — surfaced with `confidence >= 0.7` if a phrasebook entry covers the pattern, otherwise `<= 0.6` as a pattern-based inference. Note flags that the customer is past explaining and the resolution stakes are high.

5. **`ambiguity.spans`** contains an entry for each phrasebook match, each with a `note` reproducing the phrasebook's `literal` field.

6. **`recommended_next_action.action`** is `reply` (NOT `set_reminder`; a frustration-peak / reputational-risk message must not be left to age in a queue).

7. **`recommended_next_action.reason`** explicitly references: (a) validating the impact of the failed self-serve refund flow before processing the refund, (b) the tenure leverage and the need to route to retention or a senior agent if the refund cannot be processed today, and (c) engaging the gap the customer is signalling (effort cost has exceeded value) rather than engaging the reputational threat directly.

## Pass criteria specific to this test

- `direction` is exactly `"inbound"`.
- `escalation_level` is exactly `"reputational-risk"` (NOT `"frustration-peak"`; the reputational threat raises the stakes beyond frustration alone).
- At least three phrasebook-derived subtext hypotheses appear with `confidence >= 0.7`.
- The `recommended_next_action.reason` names at least one validation step (acknowledging the failed self-serve flow) BEFORE any action step.
- The output does NOT describe the customer as "entitled", "irrational", "aggressive", "threatening" (as a character), or "a difficult customer."
- The output does NOT engage the reputational threat directly (no "we'd appreciate if you didn't post about this"; no "we cannot prevent you from sharing your experience").
- The output does NOT collapse the layered signals into a single "the customer is upset" hypothesis; each layer surfaces separately.
- Universal pack pass criteria (see `README.md`) all hold.
