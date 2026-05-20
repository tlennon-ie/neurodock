# Test 02 — Register-mismatch detection on outgoing message to an Irish-workplace channel

**Scenario:** User drafts a blunt direct reply to send into a Slack channel where the thread history is in Hiberno-softened register. The pack's tone-detection logic must surface the register mismatch (direct register being sent into a Hiberno-English context) without rewriting unless asked.

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

`mcp-translation` is mocked. The reference client passes `target_register: hiberno-softened` based on conversation context (the thread history contains "ah sure look," "fair play," "I might do that," and other Hiberno-English softeners).

## User prompt

The user runs `check_tone` on the following outgoing draft, with `target_register: hiberno-softened`:

> No. We're not doing that. The deadline is Tuesday and you need to send the document by then. Don't push back on this.

## Expected pack effect

The output must contain:

1. **`register_target`** equals `"hiberno-softened"` (echoed from the request).

2. **`register_assessment`** equals `"mismatch"`. The pack surfaces the mismatch but does NOT auto-rewrite during `check_tone`.

3. **`signals`** contains entries for each register-mismatch token:

   - `"No."` — bare opener with no softening; reads as blunt-confrontational in Hiberno-softened register.
   - `"We're not doing that."` — flat refusal without face-saving framing; in Hiberno context, "I might struggle to get that across the line" or "that's a tricky one" would do the same work without confrontation.
   - `"you need to"` — imperative directness with no softener; in Hiberno register this often reads as escalatory.
   - `"Don't push back on this."` — explicit confrontation-suppression that, in Hiberno context, will itself read as confrontational and may invite more pushback.

4. **`recommended_next_action.action`** is `clarify` or `rewrite`. The pack does not silently rewrite the message; it surfaces the mismatch and recommends the user choose whether to rewrite via the tone pack's `rewrite_outgoing` flow.

5. **`recommended_next_action.reason`** explains the substantive risk: the bluntness may be read as escalatory by Irish colleagues and is likely to damage the working relationship even if the substantive position (decline + deadline) is reasonable. The pack notes that the underlying decision is fine; the register is the issue.

## Pass criteria specific to this test

- `register_assessment` is exactly `"mismatch"` (not `"acceptable"` or `"matched"`).
- The `signals` array includes at least three of the four mismatches above.
- The output does NOT contain a rewritten message body. `check_tone` flags; `rewrite_outgoing` rewrites. The pack respects that separation.
- The output does NOT moralise about the user's draft. Phrases like "rude," "unprofessional," or "aggressive" are absent — the framing is "register mismatch," not character judgement.
- The output does NOT pan-Irish. Phrases like "Irish people would," "Irish culture is," etc., are absent. The framing stays at "this channel's register is Hiberno-softened; the draft is in a more direct register."
- Universal pack pass criteria (see `README.md`) all hold.
