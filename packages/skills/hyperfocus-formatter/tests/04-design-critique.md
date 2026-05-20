# Test 04 — Design-critique phrase trigger forces Tier B

**Tier:** B (forced by phrase trigger, not by session length)
**Goal:** Verify that a design-critique phrase trigger applies aggressive Answer-First shaping — the verdict lands on line 1, the reasoning follows — even on a short (8-minute) session that would otherwise sit in Tier A.

## Given

Profile:

```yaml
preferences:
  output_format: "answer_first"
  max_chunk_size: 5
chronometric:
  hyperfocus_break_minutes: 90
```

Mocked `get_time_context()` returns:

```json
{
  "now": "2026-05-15T10:08:00+01:00",
  "day_of_week": "Friday",
  "time_since_last_prompt": "PT38S",
  "current_session_length": "PT8M00S",
  "energy_zone": "morning_peak"
}
```

`request_break_if_needed` is NOT called (well below threshold).

The design-critique override fires because the user prompt contains the phrase trigger `"Figma review please"` (case-insensitive substring match against the frontmatter trigger list).

## User prompt

> Figma review please — here's the new onboarding flow, three screens, prototype link attached. Anything land wrong before I push to dev?

## Expected transformed output

```
Don't ship: screen 2's primary CTA loses contrast on the brand-purple background.

- Screen 1 reads cleanly; hierarchy and spacing match the design-system tokens.
- Screen 2 fails WCAG AA — measured 3.1:1 on the "Continue" CTA against `--brand-purple-600`; needs to clear 4.5:1.
- Screen 3's progress indicator regresses to step 2 after a back-nav; either persist progress in URL state or hide the indicator on back.
- Motion on the screen-1 → screen-2 transition is 480 ms; the rest of the product uses 240 ms, so this feels sluggish by comparison.
- Copy on screen 3 ("Almost done!") doesn't match the brand voice guide — voice guide says no exclamation marks in onboarding.

<details><summary>More detail</summary>

The contrast issue on screen 2 is the only hard blocker; everything else is iterate-and-ship. To fix the CTA, either drop the surface to `--brand-purple-500` (measured 4.7:1) or switch the CTA fill to `--surface-on-brand` with `--brand-purple-900` text (measured 11.2:1). The progress-indicator regression is a state-management bug, not a design bug — flag it to the frontend agent rather than reworking the comp. The 480 ms transition is set in `prototypes/onboarding.fig` frame "Welcome → Profile"; align it to the global `--duration-normal` token (240 ms) used in `styles/tokens.css`. The exclamation-mark copy fix is mechanical: `"Almost done!"` → `"Almost done."` and revalidate against `docs/voice-guide.md` section 3.2.

</details>
```

## Pass criteria specific to this test

- The design-critique phrase trigger `"Figma review please"` was matched against the user prompt (case-insensitive substring).
- Tier B was applied despite the 8-minute session length (which would otherwise be Tier A).
- First line is the **verdict** ("Don't ship: …"), not a preamble or context-setting sentence. The call lands before the reasoning.
- First line ≤ 80 characters. Confirmed: 79 characters.
- Visible section contains exactly 5 bullets (equal to `max_chunk_size`).
- Surplus content lives inside a `<details>` block.
- No mention of session length, threshold, break suggestion, or the word "hyperfocus".
- `request_break_if_needed` was not called.
- Universal pass criteria (see `README.md`) all hold.
