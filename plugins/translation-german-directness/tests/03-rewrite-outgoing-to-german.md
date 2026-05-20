# Test 03 — Rewrite over-hedged outgoing draft into German direct register, preserving substantive content

**Scenario:** User (an Anglophone) has an over-hedged draft and asks the pack to rewrite it for a German team in the direct register. The pack must strip hedging that obscures the ask, preserve substantive content, and not invent claims the user did not make.

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

The reference client passes:

- `target_register: "to-german-direct"`
- `preserve_terms: ["data-processing section", "Friday", "17:00"]`
- `preserve_intent: "flag a specific issue in the data-processing section that needs revision before approval; request response by Friday 17:00"`

## User prompt

The user runs `rewrite_outgoing` on the following draft:

> Hi all — I just wanted to circle back and maybe gently flag that perhaps there could possibly be a small issue with the data-processing section, if you think that's fair? I might be wrong of course! Just thought I'd mention it. It'd be amazing if we could maybe hear back, like, sometime this week, by Friday 17:00 ideally?

## Expected pack effect

The output must contain:

1. **`rewritten`** — a rewritten message that:

   - Surfaces the substantive ask directly (the data-processing section needs revision before approval).
   - Contains the literal string `"data-processing section"` verbatim.
   - Contains `"Friday"` and `"17:00"` verbatim.
   - Strips preamble ("I just wanted to circle back and maybe gently flag," "Just thought I'd mention it").
   - Strips stacked hedges ("perhaps there could possibly be," "if you think that's fair?").
   - Strips pre-emptive self-undermining ("I might be wrong of course!").
   - States the deadline as a firm request, not as optional ("Please reply by Friday 17:00").
   - Does NOT invent new substantive content (no fabricated detail about what is wrong with the data-processing section beyond what the user said).
   - Does NOT change the deadline.

2. **`preserved_terms`** contains exactly `["data-processing section", "Friday", "17:00"]`.

3. **`unpreserved_terms`** is empty.

4. **`diff_summary.tone_shift`** is `"more_direct"`.

5. **`diff_summary.structural_changes`** lists at minimum:

   - Preamble removed.
   - Stacked hedges removed.
   - Pre-emptive self-undermining removed.
   - Deadline restated as firm request.

6. **`register_target`** echoed in the output equals `"to-german-direct"`.

## Pass criteria specific to this test

- All three preserved terms appear in `rewritten` exactly as written.
- The rewrite preserves the scoped-critique nature: it flags the data-processing section specifically, not the document as a whole.
- The rewrite does NOT invent additional issues beyond what the user said. The user described "a small issue"; the rewrite makes the issue specific in framing (data-processing section needs revision) but does NOT add concrete defects that were not in the input.
- The rewrite does NOT contain editorialising about the user's draft ("draft was weak," "draft was too soft," etc.); the `structural_changes` entries are descriptive, not evaluative.
- The rewrite does NOT pan-German ("Germans prefer," "Germans demand," etc.).
- Universal pack pass criteria (see `README.md`) all hold.
