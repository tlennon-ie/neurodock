# Test 03 — multi-stakeholder hedged decision

## Scenario

It is Wednesday 2026-05-27, 11:05 local time. The user — display name `Thomas` — has just attended a five-speaker strategy meeting about the `phase-2-pricing` project. The user pastes the transcript with `/brief phase-2-pricing`. The profile sets `identity.display_name: "Thomas"`, `identity.neurotypes: ["asd"]`. The local cognitive graph has no prior decisions on `phase-2-pricing` (it is a new project) — `recall_decisions` returns an empty list, so the Prior decisions section is omitted entirely.

The meeting reaches one decision but it is **hedged** ("I think we're leaning toward X but let me confirm with Jane"). The skill must:

1. Surface the hedged statement as a decision with `decided_by` reflecting the speaker (Director), and tag the reason of the related ambiguous item as `hedged_commitment`.
2. Also surface the "let me confirm with Jane" half as a separate ambiguous item with reason `deferred_topic` — Jane is not present in the meeting and the confirmation is deferred.
3. Write exactly one decision into the graph (the hedged one).
4. Not invent Jane's input. Not invent additional decisions to "complete" the picture.

Transcript:

```
Director: Let's narrow the pricing options. Where are we?
Priya: I think the data points toward Option B — usage-based with a free tier.
Roberto: Option B works for engineering. We can ship the metering in v0.2.
Thomas: From a community standpoint Option B is the least friction.
Patricia: I'd lean Option B too. But Jane in finance has flagged margin concerns.
Director: OK, I think we're leaning toward Option B but let me confirm with Jane before we lock it.
Priya: Sounds good. What's the timeline on Jane's input?
Director: I'll get back to you. End of this week ideally.
Thomas: Should we draft the announcement against Option B in the meantime?
Director: Draft against Option B but mark it provisional.
Thomas: Got it.
```

## Expected MCP tool sequence

1. `mcp-translation.brief_meeting({ transcript: "<the transcript above>", me: "Thomas", project: "phase-2-pricing" })` →
   ```json
   {
     "my_asks": [
       {
         "text": "Draft the launch announcement against Option B, marked provisional.",
         "asker": "Director",
         "due": null,
         "quoted_span": {
           "start_char": 587,
           "end_char": 691,
           "text": "Thomas: Should we draft the announcement against Option B in the meantime?\nDirector: Draft against Option B but mark it provisional."
         }
       }
     ],
     "others_asks": [],
     "decisions": [
       {
         "text": "Lean toward Option B (usage-based with free tier); pending Jane's confirmation on margin.",
         "decided_by": ["Director"],
         "quoted_span": {
           "start_char": 380,
           "end_char": 489,
           "text": "Director: OK, I think we're leaning toward Option B but let me confirm with Jane before we lock it."
         }
       },
       {
         "text": "Draft launch announcement against Option B but mark it provisional.",
         "decided_by": ["Director"],
         "quoted_span": {
           "start_char": 587,
           "end_char": 691,
           "text": "Thomas: Should we draft the announcement against Option B in the meantime?\nDirector: Draft against Option B but mark it provisional."
         }
       }
     ],
     "ambiguous_items": [
       {
         "text": "Final pricing decision is hedged on Jane's margin review — not locked.",
         "verbatim": true,
         "quoted_span": {
           "start_char": 380,
           "end_char": 489,
           "text": "Director: OK, I think we're leaning toward Option B but let me confirm with Jane before we lock it."
         },
         "reason": "hedged_commitment"
       },
       {
         "text": "Timing of Jane's input — 'end of this week ideally' was not committed.",
         "verbatim": true,
         "quoted_span": {
           "start_char": 537,
           "end_char": 586,
           "text": "Director: I'll get back to you. End of this week ideally."
         },
         "reason": "vague_timeline"
       }
     ],
     "eval_corpus_slice": "packages/evals/corpora/translation/meeting/v0.1.0/general.jsonl",
     "model_provenance": {
       "mode": "cloud",
       "provider": "anthropic",
       "model": "claude-sonnet-4.6"
     }
   }
   ```
   (Character offsets are illustrative; the runner validates `quoted_span.text` against the actual slice of the supplied transcript.)

2. `mcp-cognitive-graph.recall_decisions({ project: "phase-2-pricing", since: "2026-04-27" })` →
   ```json
   { "decisions": [], "truncated": false }
   ```

3. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", name: "Lean toward Option B (usage-based with free tier); pending Jane's confirmation on margin." }, predicate: "decided_in", object: { type: "project", name: "phase-2-pricing" }, source: "meeting transcript via asd-meeting-translator", confidence: 0.85 })` → returns a `fact_id`.

4. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", name: "Draft launch announcement against Option B but mark it provisional." }, predicate: "decided_in", object: { type: "project", name: "phase-2-pricing" }, source: "meeting transcript via asd-meeting-translator", confidence: 0.85 })` → returns a `fact_id`.

No other tool calls. Specifically: no ask is written; no ambiguous item is written; no extra `recall_decisions` calls.

## Expected response shape

- Opens with one sentence ≤ 80 characters containing the four integers `2`, `1`, `0`, `2` in that order.
- Four labelled sections present in order: `### Decisions`, `### Asks of you`, `### Asks of others`, `### Ambiguous items`. No `### Prior decisions on this project (last 30 days)` section (empty list).
- Decisions section has two bullets. The first bullet quotes the hedged decision text and lists `Director` as decided_by. The second bullet quotes the provisional-draft decision.
- Asks-of-you section has one bullet referencing the provisional draft, ending with `(no deadline stated)`.
- Asks-of-others section contains exactly one bullet `- (none)`.
- Ambiguous items section has two bullets. The first quotes verbatim `Director: OK, I think we're leaning toward Option B but let me confirm with Jane before we lock it.` followed by ` — hedged_commitment`. The second quotes verbatim `Director: I'll get back to you. End of this week ideally.` followed by ` — vague_timeline`.
- Closing line is prepended with `Cloud mode.` (because `model_provenance.mode == "cloud"`), then contains `Source: meeting transcript.`, `Model: anthropic/claude-sonnet-4.6 (cloud).`, and `Decisions written to graph: 2.`
- The response NEVER mentions Jane as a speaker or attributes anything to her — Jane was named in the transcript but never spoke.
- Total response length ≤ 2000 characters.

## Pass criteria

- [ ] Tool sequence is exactly four calls in order: one `brief_meeting`, one `recall_decisions`, two `record_fact`. No extra calls.
- [ ] Each `record_fact` has `predicate == "decided_in"` and `object.name == "phase-2-pricing"`.
- [ ] No `record_fact` subject corresponds to an ask or an ambiguous item.
- [ ] First sentence ≤ 80 characters and contains the integers `2 / 1 / 0 / 2` (in order).
- [ ] Four section headers exactly: `### Decisions`, `### Asks of you`, `### Asks of others`, `### Ambiguous items`. No fifth "Prior decisions" header.
- [ ] Both ambiguous-item bullets contain a quoted string that is a verbatim substring of the input transcript.
- [ ] Reason codes rendered are exactly `hedged_commitment` and `vague_timeline`, in that order.
- [ ] Jane is not listed as a speaker, an asker, or in any `decided_by` list in the rendered response.
- [ ] The closing line begins with `Cloud mode.` and contains `(cloud)`.
- [ ] Closing line contains `Decisions written to graph: 2`.
- [ ] None of these substrings appear: `autistic`, `neurodivergent`, `spectrum`, `executive function`, `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`, `clinical`.
- [ ] No `!` (exclamation mark) anywhere in the response.
- [ ] No second-person directive phrases: `you should`, `you need to`, `you must`.
