# Test 03 — Rewrite bare policy-citation into a validated, alternative-first reply

**Scenario:** Same draft as Test 02, but the agent now invokes `rewrite_outgoing` and asks the pack to rewrite the message toward the support-de-escalation register. The rewrite must lead with a specific validation, acknowledge what the customer wanted before introducing the policy limit, offer the concrete alternative the agent IS authorised to provide, preserve named terms (refund policy section reference), and NOT invent a refund or commitment the agent did not authorise.

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

The reference client passes:

- `direction: "outbound"`
- `target_register: "support-de-escalation"`
- `preserve_terms: ["section 4.2", "seven-business-day"]`
- `preserve_intent: "deny the same-day refund request, cite the policy, but offer the standard refund as the alternative we ARE authorised to process today"`
- `context.customer_state: "reputational-risk"`
- `context.authorised_alternatives: ["initiate the standard 7-business-day refund today", "escalate to senior agent for same-day exception review"]`

## User prompt

The user runs `rewrite_outgoing` on the same draft from Test 02:

> Hello, Per our terms of service we are unable to process refunds outside of the standard seven-business-day window. Please refer to section 4.2 of our refund policy for full details. Is there anything else I can help you with today?

## Expected pack effect

The output must contain:

1. **`rewritten`** — a rewritten message that:

   - Opens with a specific validation of the failed self-serve refund attempt, NOT a generic "I understand how frustrating this must be."
   - Acknowledges what the customer wanted (same-day refund) BEFORE introducing the policy limit.
   - Names what IS available (initiating the standard 7-business-day refund today; routing for senior-agent same-day exception review) BEFORE or in place of the bare limit.
   - Contains the literal strings `"section 4.2"` and `"seven-business-day"` verbatim.
   - Does NOT lead with "Per our terms of service."
   - Does NOT use the bare construction "we are unable to" as the first introduction of the limit.
   - Removes the closure question ("Is there anything else I can help you with today?") because the case is not yet resolved.
   - Names a concrete next step (e.g. "I can initiate the standard refund right now, or I can route this to my senior colleague for a same-day exception — which would you prefer?").
   - Does NOT invent a same-day refund commitment. The agent was not authorised to grant one; the rewrite respects that.
   - Does NOT engage the customer's reputational threat directly (no defensive language about reviews).

2. **`preserved_terms`** contains exactly `["section 4.2", "seven-business-day"]`.

3. **`unpreserved_terms`** is empty.

4. **`diff_summary.tone_shift`** is one of: `"more_validating"`, `"softer_policy_citation"`, `"less_defensive"`, or `"more_specific"`.

5. **`diff_summary.structural_changes`** lists at minimum:

   - Opening replaced: bare "Per our terms of service" removed; validation of the failed self-serve flow added in its place.
   - Affirmative-before-limitation reorder: the authorised alternatives surface before the policy limit.
   - Closure question removed: "Is there anything else I can help you with today?" dropped because the case remains open.
   - A concrete choice or next step added at the close.

6. **`register_target`** echoed in the output equals `"support-de-escalation"`.

## Pass criteria specific to this test

- Both preserved terms appear in `rewritten` exactly as written.
- The rewrite's first sentence references the specific failure the customer reported (the hung self-serve refund flow) OR acknowledges the customer's wait/effort in concrete terms — NOT a generic "I'm sorry for the inconvenience."
- The rewrite does NOT contain the bare phrase "Per our terms of service" as the policy introducer.
- The rewrite does NOT contain "we are unable to" as the first introduction of the limit. (The phrase may appear later if structurally necessary, but not as the lead.)
- The rewrite does NOT contain "Is there anything else I can help you with today?" or close paraphrases.
- The rewrite includes at least one of: a same-day senior-agent escalation offer, a same-day standard refund initiation offer, or both — drawn from `context.authorised_alternatives`.
- The rewrite does NOT promise a same-day refund or any commitment outside `context.authorised_alternatives`.
- The rewrite does NOT engage the customer's reputational threat (no "we hope you won't post about this", no "we cannot stop you from sharing your experience").
- The rewrite does NOT contain saccharine over-apology ("I am so terribly sorry for everything you've been through"). One specific acknowledgement is sufficient; piled-on apologies read as insincere.
- Universal pack pass criteria (see `README.md`) all hold.
