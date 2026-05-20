# Test 02 — Register-mismatch detection on outgoing message to counsel

**Scenario:** User drafts a casual reply to outside counsel and runs it through `check_tone`. The pack's tone-detection logic must surface the register mismatch (casual register being sent into a legal-formal context) without rewriting unless asked.

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

`mcp-translation` is mocked. The reference client passes `target_register: legal-formal-neutral` based on the conversation context (the recipient field is a lawyer's email; the thread history contains terms of art).

## User prompt

The user runs `check_tone` on the following outgoing draft, with `target_register: legal-formal-neutral`:

> Hey — yeah no problem, that's fine, btw the warranty cap thing is whatever you want. Send me the draft when it's done, ASAP if you can. Cheers.

## Expected pack effect

The output must contain:

1. **`register_target`** equals `"legal-formal-neutral"` (echoed from the request).

2. **`register_assessment`** equals `"mismatch"`. The pack surfaces the mismatch but does NOT auto-rewrite during `check_tone`.

3. **`signals`** contains entries for each register-mismatch token:
   - `"Hey"` — opener, register-mismatched (casual vs legal-formal).
   - `"yeah no problem"` — substantive concession in casual register (potential record-creation issue; what was the user actually agreeing to?).
   - `"the warranty cap thing"` — vague referent to what the prior thread treated as a term of art.
   - `"whatever you want"` — sounds like a waiver of position; in a legal thread this can read as conceding more than the user intended.
   - `"btw"`, `"ASAP"`, `"Cheers"` — all casual-register markers.

4. **`recommended_next_action.action`** is `clarify`. The pack does not silently rewrite the message; it surfaces the mismatch and recommends the user choose whether to rewrite via the tone pack's `rewrite_outgoing` flow.

5. **`recommended_next_action.reason`** explains the substantive risk: the casual phrasing may be interpreted as a more binding concession than the user intended (the "whatever you want" + "the warranty cap thing" combination, in particular, reads as a waiver in a record-aware context).

## Pass criteria specific to this test

- `register_assessment` is exactly `"mismatch"` (not `"acceptable"` or `"matched"`).
- The `signals` array includes at least the four substantive mismatches: `"Hey"`, `"yeah no problem"`, `"the warranty cap thing"`, `"whatever you want"`.
- The output does NOT contain a rewritten message body. `check_tone` flags; `rewrite_outgoing` rewrites. The pack respects that separation.
- The output does NOT moralise about the user's draft. Phrases like "unprofessional," "sloppy," "inappropriate," or "rude" are absent.
- Universal pack pass criteria (see `README.md`) all hold.
