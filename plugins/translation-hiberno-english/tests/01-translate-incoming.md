# Test 01 — Literal-translate flow over a Hiberno-English Slack reply

**Scenario:** User receives a short Slack reply from an Irish colleague stacking three softeners and an understated-enthusiasm marker. The pack's `literal_meaning.md` prompt must surface all four, distinguish the soft-no from genuine acknowledgement, and not editorialise about Irish speakers.

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

`mcp-translation` is mocked with the pack installed and the base prompts shadowed by the pack's overrides. The reference client passes through `domain: hiberno-english` to the server.

## User prompt

The user passes the following Slack message into `translate_incoming`:

> Ah look, fair play for putting that together — it's mighty. I might do that next sprint, sure we'll see how we get on. I'll let you off.

## Expected pack effect

The output must contain:

1. **`explicit_ask`** is `null`. The message contains no explicit ask — it is acknowledgement plus polite decline plus closure.

2. **`ambiguity.spans`** contains entries for at least:

   - "fair play" — the `note` matches the phrasebook entry's `literal` (sincere recognition, not perfunctory politeness).
   - "it's mighty" — `note` from the phrasebook ("That's mighty" — genuine approval; the understatement is the register).
   - "I might do that" — `note` from the phrasebook ("polite decline; treat as a soft no").
   - "we'll see how we get on" — `note` from the phrasebook ("no committed plan; if you need movement, follow up explicitly").
   - "I'll let you off" — `note` from the phrasebook ("conventional courtesy ending the chat; not a status judgement").

3. **`cultural_register`** contains:

   - `softeners`: includes "I might do that" and "we'll see how we get on".
   - `enthusiasm_markers`: includes "fair play" and "it's mighty".
   - `closing_markers`: includes "ah look" and "I'll let you off".

4. **`likely_subtext`** contains at least:

   - A hypothesis with `confidence >= 0.7` derived from the phrasebook: the sender is sincerely acknowledging the work, declining to take it on this sprint, and closing the topic. The praise is real; the commitment is not.
   - A hypothesis surfacing the cumulative softening pattern: three softeners stacked together signal a polite decline phrased as deferred-possibility, not a real maybe.

5. **`recommended_next_action.action`** is `note`, `defer`, or `follow_up`. `reason` references that the praise is sincere but the action is not committed; the user should not expect the sender to do the work next sprint and should raise it again explicitly if they need it done.

## Pass criteria specific to this test

- The output describes "I might do that" as a soft no, not as a genuine maybe.
- The output describes "it's mighty" and "fair play" as sincere praise, not as faint praise or politeness padding.
- The output does NOT contain editorialising about the sender ("evasive," "indirect," "vague," "non-committal as usual"). Softening is described as register, not character.
- The output does NOT generalise to "Irish people" or similar pan-Irish framing.
- Universal pack pass criteria (see `README.md`) all hold.
