# Test 02 — Register-mismatch detection on casual outgoing message to a senior Japanese counterpart

**Scenario:** User drafts a casual English email to a senior Japanese counterpart and runs it through `check_tone`. The pack's tone-detection logic must surface the register mismatch (casual register being sent into a context that calls for keigo) without rewriting unless asked.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en-GB
plugins:
  translation-japanese-keigo:
    enabled: true
```

`mcp-translation` is mocked. The reference client passes `target_register: to-keigo` based on conversation context (the thread is with a senior external counterpart; the prior emails are in formal keigo with sonkeigo addressing the user).

## User prompt

The user runs `check_tone` on the following outgoing draft, with `target_register: to-keigo`:

> Hi Tanaka — got your message thanks! Yeah we can do that. I'll send the doc over tomorrow. Cheers!

## Expected pack effect

The output must contain:

1. **`register_target`** equals `"to-keigo"` (echoed from the request).

2. **`register_assessment`** equals `"mismatch"`. The pack surfaces the mismatch but does NOT auto-rewrite during `check_tone`.

3. **`signals`** contains entries for each register-mismatch token:

   - `"Hi Tanaka"` — casual greeting with first-surname-only; mismatched with the formal-context expectation of "田中様" (Tanaka-sama) plus relationship-acknowledgement opener ("お世話になっております").
   - Missing opener — no "お世話になっております" or equivalent acknowledgement of the existing business relationship.
   - `"Yeah we can do that"` — casual confirmation in a context that calls for kenjougo confirmation ("承知いたしました" or similar).
   - `"I'll send the doc over tomorrow"` — casual direct commitment; in keigo context expects kenjougo verb forms.
   - `"Cheers!"` — casual closer; mismatched with formal-context expectation of "よろしくお願いいたします."
   - Missing closer — no relationship-continuation acknowledgement.

4. **`recommended_next_action.action`** is `clarify` or `rewrite`. The pack does not silently rewrite the message; it surfaces the mismatch and recommends the user choose whether to rewrite via the tone pack's `rewrite_outgoing` flow.

5. **`recommended_next_action.reason`** explains the substantive risk: sending casual register to a senior counterpart in a formal-keigo thread will read as either dismissive of the relationship or unaware of the register expectations. The substantive content (confirmation + commitment to send the document tomorrow) is fine; the register frame around it is the issue.

## Pass criteria specific to this test

- `register_assessment` is exactly `"mismatch"` (not `"acceptable"` or `"matched"`).
- The `signals` array includes at least four of the six mismatches above.
- The output does NOT contain a rewritten message body. `check_tone` flags; `rewrite_outgoing` rewrites.
- The output does NOT moralise about the user's draft ("rude," "disrespectful," "unprofessional"). The framing is register mismatch with a substantive note about how it will land.
- The output does NOT pan-Japanese ("Japanese people require," "Japanese culture demands"). The framing stays at "this thread's register is formal keigo; the draft is in casual English register."
- Universal pack pass criteria (see `README.md`) all hold.
