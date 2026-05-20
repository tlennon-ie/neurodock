# Test 01 — Literal-translate flow over a keigo email containing the canonical soft-no pattern

**Scenario:** User receives a formal Japanese email containing the canonical soft-refusal pattern ("検討させていただきます") combined with a group-decision-deferral ("社内で") and conventional formal opener/closer. The pack's `literal_meaning.md` prompt must surface the soft-no, name the group-decision timeline, and NOT misread the polite shape as genuine deliberation.

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

`mcp-translation` is mocked with the pack installed and the base prompts shadowed by the pack's overrides. The reference client passes through `domain: japanese-keigo` to the server.

## User prompt

The user passes the following Japanese email into `translate_incoming`:

> 田中様
>
> お世話になっております。先日は貴重なご提案をいただき、誠にありがとうございました。社内で検討させていただきましたが、現時点では難しいかもしれません。今後ともよろしくお願いいたします。
>
> 山田

Romaji (for reference): Tanaka-sama / o-sewa ni natte orimasu. Senjitsu wa kichou na go-teian o itadaki, makoto ni arigatou gozaimashita. Shanai de kentou sasete itadakimashita ga, gen-jiten de wa muzukashii kamoshiremasen. Kongo tomo yoroshiku onegai itashimasu. / Yamada

## Expected pack effect

The output must contain:

1. **`explicit_ask`** is `null`. The message contains no explicit ask — it is a soft refusal of a previously-made proposal.

2. **`ambiguity.spans`** contains entries for at least:

   - "お世話になっております" — the `note` matches the phrasebook entry's `literal` (formal-email opener with real warmth; not perfunctory).
   - "貴重なご意見ありがとうございます" or the close variant "貴重なご提案をいただき、誠にありがとうございました" — `note` from the phrasebook (standard acknowledgement; does NOT necessarily commit to action).
   - "社内で検討させていただきます" (here in past tense form) — `note` from the phrasebook (group-decision-deferral; consensus process has been run).
   - "難しいかもしれません" — `note` from the phrasebook (soft refusal; the hedge does not mean negotiable).
   - "今後ともよろしくお願いいたします" — formal-closer with relationship-continuation; signals door-open for future business.

3. **`keigo_register_breakdown`** contains:

   - `sonkeigo`: includes "貴重なご提案" (honourable proposal — sonkeigo for the listener's contribution).
   - `kenjougo`: includes "検討させていただきました" and "おねがいいたします" (humble forms for the speaker's actions).
   - `teineigo`: includes "お世話になっております" (polite-neutral formal opener).
   - `register_signalling_note`: a short note explaining that the speaker uses sonkeigo for the listener's proposal and kenjougo for their own deliberation — the conventional formal-decline register.

4. **`likely_subtext`** contains at least:

   - A high-confidence (≥ 0.7) hypothesis identifying the message as a soft refusal of the user's prior proposal. The combination of "難しいかもしれません" plus the past-tense "社内で検討させていただきました" means the consensus process has already happened and produced a no.
   - A second hypothesis noting that the relationship-continuation closer ("今後ともよろしくお願いいたします") preserves the door for future proposals; the refusal is of this specific proposal, not a relationship-ending move.

5. **`recommended_next_action.action`** is `note`, `defer`, or `follow_up`. `reason` explains that the refusal is final for this proposal; an appropriate next step is a polite acknowledgement and a future revised approach if appropriate.

## Pass criteria specific to this test

- The output explicitly identifies the message as a soft refusal of the user's prior proposal — NOT as ongoing consideration.
- The output does NOT contain phrases that suggest the matter is still being deliberated (e.g. "they are still considering," "still under review").
- The output does NOT flatten "お世話になっております" into a cold "Hello" or "Dear sir"; the warmth of the formal opener is preserved.
- The output does NOT contain editorialising about the sender ("indirect," "evasive," "vague"). Keigo softening is described as register, not character.
- The output does NOT generalise to "the Japanese" or pan-Japanese framing.
- The output surfaces that the relationship-continuation closer keeps the door open for future business — distinguishing this from a relationship-ending refusal.
- Universal pack pass criteria (see `README.md`) all hold.
