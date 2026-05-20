# Test 02 — Register-mismatch detection on over-hedged outgoing message to a German team

**Scenario:** User (an Anglophone) drafts a heavily-hedged Slack message to send into a Slack channel where the thread history is in German workplace register. The pack's tone-detection logic must surface the register mismatch (over-hedging that obscures the substance) without rewriting unless asked.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en-GB
plugins:
  translation-german-directness:
    enabled: true
```

`mcp-translation` is mocked. The reference client passes `target_register: to-german-direct` based on conversation context (the thread history is in German workplace register with direct critique and formal closures).

## User prompt

The user runs `check_tone` on the following outgoing draft, with `target_register: to-german-direct`:

> Hi all — I just wanted to circle back and maybe gently flag that perhaps there could possibly be a small issue with the data-processing section, if you think that's fair? I might be wrong of course! Just thought I'd mention it. Happy to discuss whenever suits :)

## Expected pack effect

The output must contain:

1. **`register_target`** equals `"to-german-direct"` (echoed from the request).

2. **`register_assessment`** equals `"mismatch"`. The pack surfaces the mismatch but does NOT auto-rewrite during `check_tone`.

3. **`signals`** contains entries for each register-mismatch token:

   - `"I just wanted to circle back"` — preamble that delays the substance; reads as time-wasting in German workplace register.
   - `"maybe gently flag that perhaps there could possibly be"` — stacked hedges that obscure whether the issue is real or speculative.
   - `"a small issue"` — minimisation that may cause the recipient to under-prioritise a substantive concern.
   - `"if you think that's fair?"` — permission-seeking framing that delegates the decision to the recipient without surfacing the speaker's actual view.
   - `"I might be wrong of course!"` — pre-emptive self-undermining that reads as lack of confidence in own analysis.
   - `"Happy to discuss whenever suits"` — open-ended availability with no deadline; in German workplace register this often reads as "I do not actually want this resolved soon."

4. **`recommended_next_action.action`** is `clarify` or `rewrite`. The pack does not silently rewrite the message; it surfaces the mismatch and recommends the user choose whether to rewrite via the tone pack's `rewrite_outgoing` flow.

5. **`recommended_next_action.reason`** explains the substantive risk: the stacked hedging makes it unclear whether the speaker actually has a concern or is just musing. A German-register recipient may either dismiss the message as not requiring action or feel they have to do extra work to extract the actual ask. Both outcomes waste time the directness register exists to save.

## Pass criteria specific to this test

- `register_assessment` is exactly `"mismatch"` (not `"acceptable"` or `"matched"`).
- The `signals` array includes at least four of the six mismatches above.
- The output does NOT contain a rewritten message body. `check_tone` flags; `rewrite_outgoing` rewrites.
- The output does NOT moralise about the user's draft as "weak," "indecisive," or similar. The framing is "register mismatch" plus a substantive note that over-hedging obscures the ask.
- The output does NOT pan-German ("Germans hate hedging," etc.). The framing stays at "this channel's register is German direct; the draft is over-hedged for that register."
- Universal pack pass criteria (see `README.md`) all hold.
