---
name: hyperfocus-formatter
version: 0.1.0
description: Reformats responses to Answer-First when sessions run long; surfaces the user's own prior intent if past their break threshold.
neurotypes: ["adhd", "audhd"]
status: stable
triggers:
  - on_every_response: true   # passive activation — applies a formatting transform
mcp_dependencies:
  - server: mcp-chronometric
    tools: [get_time_context, request_break_if_needed]
profile_dependencies:
  - preferences.output_format
  - preferences.max_chunk_size
  - chronometric.hyperfocus_break_minutes
license: AGPL-3.0-or-later
---

# hyperfocus-formatter

A passive output transform. After the LLM has decided what to say, this skill reshapes how to say it based on how long the current session has been open. Short sessions get a light Answer-First touch. Longer sessions get an aggressive Answer-First structure with a hard chunk limit. Sessions past the user's own pre-configured break threshold get one verbatim line of their own prior intent prepended — never a lecture, never a block.

# TODO: phase-2 mcp-guardrail integration — once `mcp-guardrail.check_hyperfocus` lands, fold its signal into the threshold tier alongside `request_break_if_needed`.

## When to activate

- **Every response.** This skill runs passively on every LLM turn. It is a transform, not a generator.
- **Opt-out via profile.** If `preferences.output_format == "conventional"`, skip this skill entirely and emit the response unchanged.
- **No phrase triggers.** There is no user-facing command. The user opts in once via profile and the transform stays on.

## Operating instructions

1. Read `preferences.output_format` from the user profile.
   - If `"conventional"`: skip this skill. Emit the response as-is. Stop.
   - If `"answer_first"` (default) or `"bullet_first"`: continue.
2. Call `get_time_context()`. Parse `current_session_length` (ISO 8601 duration) into minutes.
3. Read `chronometric.hyperfocus_break_minutes` from profile. Default to 90 if absent.
4. Read `preferences.max_chunk_size` from profile. Default to 5 if absent. Clamp to range [1, 7].
5. Pick the tier based on `current_session_length`:
   - **Tier A — under 30 minutes.** Apply light Answer-First: one summary sentence (≤ 80 characters) as the first line. Blank line. Then the full original response unchanged.
   - **Tier B — 30 minutes up to `hyperfocus_break_minutes`.** Apply aggressive Answer-First: first line is the answer (≤ 80 characters). Next N lines are supporting bullets where `N == max_chunk_size`. Anything that would not fit goes into a single `<details><summary>More detail</summary>…</details>` block. Never exceed the chunk limit in the visible (non-collapsed) section.
   - **Tier C — at or above `hyperfocus_break_minutes`.** Call `request_break_if_needed(threshold_minutes = hyperfocus_break_minutes)`. If it returns `null`, fall back to Tier B. If it returns an object, prepend exactly ONE line to the Tier-B output that quotes `prior_intent` verbatim and names the `suggested_action`. Format: `Session length: <M> minutes. You set the threshold at <T>. Your stated intent: "<prior_intent>". Suggested next action: <suggested_action>.` Then a blank line, then the Tier-B response. Do not block. Do not repeat the line on subsequent responses unless the session length crosses another full threshold multiple.
6. Emit the transformed response.

## Outputs

- **Tier A.** One-sentence answer, blank line, original response.
- **Tier B.** Answer line, blank line, up to `max_chunk_size` bullets, optional collapsed details block.
- **Tier C.** One data line (session length, threshold, quoted prior intent, suggested action), blank line, Tier-B-shaped response.

The visible word count above any collapsed block must not exceed roughly 120 words in Tier B/C. If the underlying response is genuinely longer, the surplus belongs in the details block, not in the visible chunk.

## Do not

- Do not editorialise time. Never write "you've been at this a while", "wow, long session", "time flies". State the data plainly: `Session length: 102 minutes. You set the threshold at 90.`
- Do not use the word "hyperfocus" in user-facing output. It is a clinical term. The skill name uses it for developer-facing reasons only.
- Do not block, refuse, or withhold the user's response. The transform reshapes — it never gates.
- Do not use second-person directives: no "you should", no "you need to", no "you've been". State data; the user reads it.
- Do not paraphrase `prior_intent`. Quote it verbatim, inside double-quotes.
- Do not exceed `preferences.max_chunk_size` bullets in the visible section.
- Do not repeat the threshold line on every subsequent response — only when a new threshold multiple is crossed.
- Do not invent a `suggested_action` value. Use the exact string returned by `request_break_if_needed`. If the enum value is unfamiliar, render it literally (e.g. `switch_context`).

## What this skill is not

- Not a productivity coach.
- Not a wellness nudge.
- Not a moral judgement on session length.
- Not a clinical intervention. The skill emits structured data the user has pre-consented to see; nothing more.

## Examples

See `tests/`:
- `01-short-session-no-change.md` — Tier A: light Answer-First on a 12-minute session.
- `02-long-session-answer-first.md` — Tier B: aggressive Answer-First on a 75-minute session.
- `03-past-threshold-soft-nudge.md` — Tier C: one verbatim-intent line on a 102-minute session past the 90-minute threshold.
