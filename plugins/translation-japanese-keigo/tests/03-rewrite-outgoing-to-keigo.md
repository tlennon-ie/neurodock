# Test 03 — Rewrite direct English outgoing draft into appropriate keigo, preserving substantive content

**Scenario:** User has a direct English draft (confirmation + commitment + soft constraint) and asks the pack to rewrite it for a senior Japanese counterpart in appropriate keigo. The pack must deploy the right register pair (sonkeigo for the listener's actions, kenjougo for the speaker's), add formal opener and closer, preserve substantive content, and not mismatch sonkeigo and kenjougo.

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

The reference client passes:

- `target_register: "to-keigo"`
- `preserve_terms: ["田中", "Friday", "document"]`
- `preserve_intent: "confirm receipt of Tanaka's previous message; commit to sending the document by Friday; politely note that the final figures will require one additional internal review"`

## User prompt

The user runs `rewrite_outgoing` on the following draft:

> Tanaka — got your message. We'll send the document by Friday. Just a heads up: the final figures will need one more internal review before they're locked.

## Expected pack effect

The output must contain:

1. **`rewritten`** — a rewritten Japanese message that:

   - Opens with "田中様" (or "田中さん" if the relationship signals warrant it) followed by "お世話になっております" or equivalent relationship-acknowledgement opener.
   - Contains the literal Japanese name "田中" (sama-honorific applied) verbatim.
   - Confirms receipt of the prior message in kenjougo register (e.g. "ご連絡をいただきありがとうございました").
   - Commits to sending the document by Friday using the day-name appropriately (金曜日 — kin-youbi).
   - Surfaces the "final figures need one more internal review" as a polite caveat, optionally using a soft-preface ("恐れ入りますが" or "なお").
   - Closes with "よろしくお願いいたします" or a longer formal-closer variant.
   - Uses sonkeigo for the listener's prior message and any future actions of the listener (if mentioned).
   - Uses kenjougo for the speaker's own actions (sending the document, performing the internal review).
   - Does NOT mismatch sonkeigo and kenjougo (does not apply sonkeigo to the speaker's own actions).
   - Does NOT introduce new substantive content (no fabricated rationale for why the internal review is required).

2. **`preserved_terms`** contains `"田中"` and `"document"`; for the day-name preservation, the rewrite may map "Friday" → "金曜日" with the mapping noted in `structural_changes` (in this case "Friday" appears in `unpreserved_terms` with a note explaining the localisation, OR the rewrite preserves "Friday" verbatim alongside the Japanese equivalent — both are acceptable).

3. **`unpreserved_terms`** is empty if "Friday" is preserved verbatim, OR contains "Friday" with a localisation note if mapped to "金曜日."

4. **`diff_summary.tone_shift`** is `"more_formal"`.

5. **`diff_summary.structural_changes`** lists at minimum:

   - Formal opener added.
   - Kenjougo verb forms applied to speaker actions.
   - Sonkeigo applied to listener's prior message.
   - Soft-preface added before the caveat.
   - Formal closer added.

6. **`register_target`** echoed in the output equals `"to-keigo"`.

7. **`keigo_register_used`** contains at least `"sonkeigo"`, `"kenjougo"`, and `"teineigo"`.

## Pass criteria specific to this test

- The Japanese name `"田中"` appears in `rewritten` exactly as written, with appropriate honorific (sama or san) following.
- The substantive commitments are preserved: send document, deadline of Friday (in Japanese-localised form acceptable), one more internal review required.
- The rewrite does NOT mismatch sonkeigo and kenjougo. Speaker's own actions (sending the document, performing the review) use kenjougo (e.g. "送らせていただきます," "確認させていただきます"); the listener's prior message uses sonkeigo (e.g. "ご連絡をいただき").
- The rewrite does NOT invent additional substantive content beyond what the user said (no fabricated reason for the internal review, no invented contact-context, no new commitments).
- The rewrite does NOT contain editorialising about the user's draft. `structural_changes` entries are descriptive, not evaluative.
- The rewrite does NOT pan-Japanese.
- Universal pack pass criteria (see `README.md`) all hold.
