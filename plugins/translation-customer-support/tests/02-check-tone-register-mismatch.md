# Test 02 — Register-mismatch detection on an outbound bare-policy-citation draft

**Scenario:** A support agent drafts an outbound reply to the irate customer from Test 01. The draft cites the refund policy without acknowledging the customer's frustration, without naming the failed self-serve flow, and without offering an alternative. The pack's tone-detection logic must flag the mismatch (bare policy citation into a reputational-risk context) without rewriting unless asked.

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

`mcp-translation` is mocked. The reference client passes:

- `direction: "outbound"`
- `target_register: "support-de-escalation"` based on the customer-state context (the agent has tagged the inbound message as `reputational-risk` per the Test 01 classification).
- `context.customer_state: "reputational-risk"`

## User prompt

The user runs `check_tone` on the following outbound draft, with `target_register: support-de-escalation`:

> Hello, Per our terms of service we are unable to process refunds outside of the standard seven-business-day window. Please refer to section 4.2 of our refund policy for full details. Is there anything else I can help you with today?

## Expected pack effect

The output must contain:

1. **`direction`** equals `"outbound"`.

2. **`register_target`** equals `"support-de-escalation"` (echoed from the request).

3. **`register_assessment`** equals `"mismatch"`. The pack surfaces the mismatch but does NOT auto-rewrite during `check_tone`.

4. **`signals`** contains entries for each register-mismatch token, each with a brief explanation of why the token is mismatched for the target register and the customer state:

   - `"Per our terms of service"` — phrasebook match (policy-citation register). Flagged as bare citation with no acknowledgement of what the customer wanted; reads as a wall into a reputational-risk context.
   - `"we are unable to"` — phrasebook match (policy-citation register). Flagged as a soft 'no' that customers report as impersonal; pattern that performs better is leading with what IS available.
   - Absence of any validation phrase — flagged as a structural gap. A reply to a frustration-peak / reputational-risk inbound that contains no acknowledgement is a register-mismatch even if every present sentence is professionally written.
   - Absence of any reference to the specific failure the customer reported (the hung self-serve refund flow) — flagged as a structural gap; the customer will read the silence as "they didn't even look at what I said."
   - `"Is there anything else I can help you with today?"` — phrasebook match (case-closure register). Flagged as a brush-off when the original issue is unresolved; reads as the agent trying to close a case the customer regards as open.

5. **`recommended_next_action.action`** is `clarify`. The pack does not silently rewrite; it surfaces the mismatch and recommends the agent use `rewrite_outgoing` if they want a rewrite.

6. **`recommended_next_action.reason`** explains the substantive risk: sending bare policy citation into a reputational-risk context reliably escalates the ticket and frequently becomes a public-complaint thread. Recommend: open with a specific acknowledgement (the failed self-serve flow), offer the alternative that IS available before naming the limit, and remove the closure question until the case is genuinely resolved.

## Pass criteria specific to this test

- `register_assessment` is exactly `"mismatch"` (not `"acceptable"` or `"matched"`).
- The `signals` array includes both lexical mismatches ("Per our terms of service", "we are unable to", "Is there anything else…") AND at least one structural-gap signal (absence of validation; absence of reference to the specific failure).
- The output does NOT contain a rewritten message body. `check_tone` flags; `rewrite_outgoing` rewrites.
- The output does NOT describe the draft as "lazy", "robotic", "unprofessional", or "insincere." The mismatch is described as a register effect, not a character note about the agent.
- The output does NOT describe the customer as "difficult", "irrational", or similar. The mismatch is about what the draft signals to a reputational-risk customer, not about the customer's state being unreasonable.
- The output does NOT recommend simply removing the policy — the policy is real; the mismatch is in HOW the policy is being delivered, not WHETHER it should be.
- Universal pack pass criteria (see `README.md`) all hold.
