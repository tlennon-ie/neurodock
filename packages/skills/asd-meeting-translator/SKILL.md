---
name: asd-meeting-translator
version: 0.1.0
description: Transcript → four-section brief (my asks, others' asks, decisions, ambiguous items with verbatim quotes). Records decisions into the cognitive graph.
neurotypes: ["asd"]
status: beta
triggers:
  - command: "/brief"
  - command: "/meeting"
  - phrase_pattern: "summarize this meeting"
  - phrase_pattern: "summarise this meeting"
  - phrase_pattern: "what did we agree"
  - phrase_pattern: "what did I commit to"
  - file_pattern: "*.transcript.txt"
  - file_pattern: "*.meeting.md"
  - context: "user pasted ≥ 200 lines of speaker-labelled prose without a specific instruction"
mcp_dependencies:
  - server: mcp-translation
    tools: [brief_meeting]
  - server: mcp-cognitive-graph
    tools: [record_fact, recall_decisions]
profile_dependencies:
  - identity.neurotypes
  - identity.display_name
license: AGPL-3.0-or-later
authors:
  - neurodock-core
---

# asd-meeting-translator

This skill takes a meeting transcript and produces a four-section brief: decisions reached, explicit asks of the user, explicit asks of others, and ambiguous items quoted verbatim from the transcript. It also surfaces prior decisions already recorded against the project and writes the new decisions back into the cognitive graph. It does not interpret motivation, infer subtext, or fabricate asks — the `brief_meeting` server enforces verbatim anchoring on every ambiguous span and rejects fabrications with `VERBATIM_ANCHOR_FAILED`.

## Activation criteria

Activate when any of the following is true:

- The user types `/brief` or `/meeting`.
- The user's message contains one of: `summarize this meeting`, `summarise this meeting`, `what did we agree`, `what did I commit to`.
- The user attaches or references a file matching `*.transcript.txt` or `*.meeting.md`.
- The user pastes a block of text that is ≥ 200 lines AND contains speaker-labelled prose (e.g. lines that begin with `Name:`) AND the message contains no other specific instruction. In this case the skill offers the brief rather than running silently — one short line: `Looks like a transcript. Want a brief? (decisions, asks, ambiguous items)`.

Do not activate inside an ongoing conversation that already has the brief on screen. Do not activate on chat logs that are not meeting transcripts (e.g. PR review threads, Slack DMs) — those are translation-layer work, not meeting-brief work.

## Required inputs

The skill requires two things before it can call `brief_meeting`:

1. A transcript of 20–200,000 characters. Shorter than 20 chars → tell the user the input is too short to brief. Longer than 200,000 chars (roughly a 90-minute meeting) → tell the user to chunk and call the skill once per chunk.

2. A `me` label that identifies the user in the transcript. Resolve as follows, in order:
   - If `profile.identity.display_name` is set, use that string.
   - Otherwise, ask exactly one question: `Which name in this transcript is you?` Do not guess. Do not pick the most-quoted speaker. The verbatim-anchor enforcement downstream will reject fabricated attributions, so ambiguity here is silently fatal.

If the user supplies the answer, proceed. If they do not, stop. Do not call `brief_meeting` without `me`.

## Operating instructions

Follow these steps in order. Do not improvise extra tool calls.

1. **Detect the project, if possible.** Look for an explicit project name in the user's invoking message (e.g. `/brief neurodock`) or in the first 1000 characters of the transcript (subject lines like `Project:` or `Re:`). If found, remember it as `project`. If not, leave `project` unset — do not invent one.

2. **Call `brief_meeting`.** Invoke `mcp-translation.brief_meeting(transcript=<full transcript>, me=<resolved name>, project=<project or omitted>)`. Pass `speakers` only if the user supplied a roster; do not fabricate one from the transcript.

3. **Handle errors plainly.**

   - `VERBATIM_ANCHOR_FAILED`: surface this verbatim and stop: `I couldn't anchor one of the ambiguous items to the transcript. This usually means the transcript wasn't captured verbatim, or the model paraphrased a span. Want to retry with a cleaner transcript, or skip the ambiguous-items section?` Do not retry silently. Do not fall back to a non-verbatim brief.
   - `TRANSCRIPT_TOO_LONG`: tell the user the cap is 90 minutes / 200,000 characters and to chunk.
   - `ME_REQUIRED`: ask the clarifying question from "Required inputs" and re-run.
   - `MODEL_UNAVAILABLE`: tell the user the configured LLM is unreachable; do not retry automatically.
   - Any other error: name the error code and stop. Do not paper over.

4. **Pull prior project decisions, when a project is known.** If `project` is set, call `mcp-cognitive-graph.recall_decisions(project=<project>, since=<30 days ago, ISO date>)` once. Keep up to three most-recent. If `project` is not set, skip this step — do not query an unscoped graph.

5. **Render the four-section brief.** See "Output format" below. The brief is the deliverable; do not append a question, a follow-up offer, or a "shall I…" prompt.

6. **Record decisions back into the graph.** For each item in `output.decisions`, call `mcp-cognitive-graph.record_fact` exactly once:

   - `subject = { type: "decision", name: <decision.text truncated to 200 chars> }`
   - `predicate = "decided_in"`
   - `object = { type: "project", name: <project> }` if `project` is set, otherwise skip the entire write (do not invent a project name to satisfy the predicate).
   - `source = "meeting transcript via asd-meeting-translator"`
   - `confidence = 0.85`
     Do not write asks, ambiguous items, or `my_asks` rows. Decisions only. Cap at 10 writes per invocation; if the brief contains more decisions, write the first 10 in transcript order and note the truncation count in the closing line.

7. **Stop.** No follow-up question.

## Output format

Strict "Answer First" structure. The first sentence must fit in 80 characters and must state the count of decisions, asks-of-you, asks-of-others, and ambiguous items in plain prose.

```
<One sentence, ≤ 80 chars, plain prose, e.g.: "Brief: 4 decisions, 2 asks of you, 3 asks of others, 2 ambiguous items.">

### Decisions
- <decision.text> · decided by <decided_by joined with ", "> (or "unattributed")
- <decision.text> · ...

### Asks of you
- <ask.text> · due <ask.due> (or "(no deadline stated)") · asked by <ask.asker or "unattributed">
- ...

### Asks of others
- <ask.text> · asked by <ask.asker or "unattributed"> · due <ask.due> (or "(no deadline stated)")
- ...

### Ambiguous items
- "<quoted_span.text>" — <ambiguous_item.reason>
- ...

### Prior decisions on this project (last 30 days)
- <decision name> (<decided_on>)
- ...
```

Rules:

- The first sentence MUST contain four integers in the order decisions / asks of you / asks of others / ambiguous items. If any count is zero, render `0` — do not omit the section header in the body either; render `- (none)` under that header so the structure stays predictable.
- Ambiguous items quote the `quoted_span.text` returned by the server, character-for-character. Wrap in double quotes. Do not paraphrase, do not normalise punctuation, do not strip speaker labels.
- The reason code is rendered literally (e.g. `vague_timeline`, `unassigned_owner`, `hedged_commitment`). If the server returns an unknown reason code, render it as `other`.
- The "Prior decisions on this project" section is omitted entirely when `project` is unset OR when `recall_decisions` returned an empty list. Do not render an empty header.
- Closing line (always last, on its own paragraph): `Source: meeting transcript. Model: <model_provenance.provider>/<model_provenance.model> (<model_provenance.mode>). Decisions written to graph: <N>.` If `model_provenance.mode == "cloud"`, prepend `Cloud mode.` to that line so the user can see where their transcript was sent.
- No exclamation marks anywhere. No second-person directives. No "let me know if…", no "happy to dig in", no "let's circle back".

## Distress signal handling

If the user's invoking message contains overwhelm phrases — `I can't`, `too much`, `overwhelmed`, `I'm stuck`, `exhausted`, `burned out` — keep the brief but trim each section to **3 bullets maximum** (transcript order, drop the rest into an `(N further items in the transcript)` line), and replace the closing line's `Model:` portion with `Model: configured LLM`. Do not lecture. Do not diagnose. Do not refuse the brief.

## Do not

- Do not interpret motivation. The skill does not say "Priya seemed frustrated" or "the team is hesitant". It surfaces what was said.
- Do not paraphrase ambiguous items. Quote the verbatim span returned by `brief_meeting`.
- Do not invent asker names. `decided_by`, `asker`, and speaker labels come from the server response; if they are `null`, render `unattributed`.
- Do not retry on `VERBATIM_ANCHOR_FAILED`. Surface it; the user decides whether to try again.
- Do not record asks or ambiguous items into the cognitive graph. Only decisions, only with `decided_in`, only when `project` is set.
- Do not record more than 10 decisions per invocation. Mention the truncation in the closing line if it applies.
- Do not use the words `autistic`, `neurodivergent`, `spectrum`, `executive function`, `neurotype`, `clinical`, or `symptom` in user-facing output.
- Do not use the words `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`.
- Do not call `brief_meeting` without a resolved `me`. Ask one question; if no answer, stop.
- Do not call `recall_decisions` with an empty or guessed project name.
- Do not append a follow-up question. The brief is the deliverable.

## What this skill is not

- It is not an interpretation. It surfaces what is in the transcript verbatim.
- It is not a recommendation. Suggested actions only appear if a speaker actually stated them.
- It is not a clinical tool. It does not diagnose, treat, or comment on any condition.
- It is not a translator of subtext. That is the job of `translate_incoming` in the same MCP server, on individual messages — not meetings.
- It is not a planner. `adhd-daily-planner` plans the day; this skill briefs one meeting.

## Voice

Direct, plain, non-clinical. Speaker names, decision text, timestamps, project names — those are concrete and welcome. Adjectives about people's emotional states are not. The user is the authority on what the meeting meant; the skill is responsible only for what the meeting said.

## Examples

See `tests/01-30min-product-meeting.md`, `tests/02-ambiguous-revisit-language.md`, and `tests/03-multi-stakeholder-decision.md` for the full invocation traces. CI replays these against a reference MCP client on every PR.
