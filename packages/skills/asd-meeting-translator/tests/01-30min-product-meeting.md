# Test 01 — 30-minute product meeting, happy path

## Scenario

It is Thursday 2026-05-21, 14:35 local time. The user — display name `Thomas` — has just attended a 30-minute product meeting about the `neurodock` v0.1 launch with two named collaborators (`Priya`, the engineering manager, and `Roberto`, the platform lead). The user pastes the transcript into the chat with the message `/brief neurodock`. Their profile sets `identity.display_name: "Thomas"`, `identity.neurotypes: ["asd"]`. The local cognitive graph has one prior decision on the `neurodock` project from two weeks ago: "Adopt sqlite-vec 0.2" (2026-05-07).

The transcript is a 30-minute meeting condensed to the following speaker-labelled text. It contains four decisions, two explicit asks of Thomas, four explicit asks of others, and two ambiguous items.

```
Priya: Welcome back. Let's lock the v0.1 launch date today.
Roberto: I think we're aiming for June 30. Any blockers I should know about?
Thomas: The clinical advisor confirmations are still pending — that gates the guardrails section of the launch post.
Priya: Then we ship v0.1 without guardrail copy. Guardrails go in v0.2. Agreed?
Thomas: Agreed. I'll cut the guardrail section from the launch post by Monday.
Roberto: Good. Thomas, can you also own the migration script and have it ready by Wednesday?
Thomas: Yes — I'll have it ready by Wednesday.
Priya: Roberto, please draft the release notes by Friday.
Roberto: On it.
Priya: We should also think about the rollback runbook. Can someone draft it?
Roberto: I can sketch one but I want eng review.
Priya: We can revisit ownership of the runbook next week.
Thomas: One more thing — the eval corpus contribution guide. Should we ship it with v0.1 or v0.2?
Priya: Let's revisit that offline.
Roberto: Decision: v0.1 launch date is June 30. Recording it.
Priya: Agreed. June 30.
```

## Expected MCP tool sequence

1. `mcp-translation.brief_meeting({ transcript: "<the transcript above>", me: "Thomas", project: "neurodock" })` →
   ```json
   {
     "my_asks": [
       {
         "text": "Cut the guardrail section from the launch post by Monday.",
         "asker": "Thomas",
         "due": "Monday",
         "quoted_span": {
           "start_char": 367,
           "end_char": 437,
           "text": "Thomas: Agreed. I'll cut the guardrail section from the launch post by Monday."
         }
       },
       {
         "text": "Own the migration script and have it ready by Wednesday.",
         "asker": "Roberto",
         "due": "Wednesday",
         "quoted_span": {
           "start_char": 438,
           "end_char": 596,
           "text": "Roberto: Good. Thomas, can you also own the migration script and have it ready by Wednesday?\nThomas: Yes — I'll have it ready by Wednesday."
         }
       }
     ],
     "others_asks": [
       {
         "text": "Roberto drafts the release notes by Friday.",
         "asker": "Priya",
         "due": "Friday",
         "quoted_span": {
           "start_char": 597,
           "end_char": 663,
           "text": "Priya: Roberto, please draft the release notes by Friday.\nRoberto: On it."
         }
       },
       {
         "text": "Someone (unassigned) drafts the rollback runbook; Roberto offered to sketch with eng review.",
         "asker": "Priya",
         "due": null,
         "quoted_span": {
           "start_char": 664,
           "end_char": 803,
           "text": "Priya: We should also think about the rollback runbook. Can someone draft it?\nRoberto: I can sketch one but I want eng review."
         }
       }
     ],
     "decisions": [
       {
         "text": "Ship v0.1 without guardrail copy; guardrails move to v0.2.",
         "decided_by": ["Priya", "Thomas"],
         "quoted_span": {
           "start_char": 269,
           "end_char": 366,
           "text": "Priya: Then we ship v0.1 without guardrail copy. Guardrails go in v0.2. Agreed?\nThomas: Agreed."
         }
       },
       {
         "text": "Thomas cuts the guardrail section from the launch post by Monday.",
         "decided_by": ["Thomas"],
         "quoted_span": {
           "start_char": 367,
           "end_char": 437,
           "text": "Thomas: Agreed. I'll cut the guardrail section from the launch post by Monday."
         }
       },
       {
         "text": "Thomas owns the migration script with a Wednesday deadline.",
         "decided_by": ["Roberto", "Thomas"],
         "quoted_span": {
           "start_char": 438,
           "end_char": 596,
           "text": "Roberto: Good. Thomas, can you also own the migration script and have it ready by Wednesday?\nThomas: Yes — I'll have it ready by Wednesday."
         }
       },
       {
         "text": "v0.1 launch date is June 30.",
         "decided_by": ["Roberto", "Priya"],
         "quoted_span": {
           "start_char": 901,
           "end_char": 985,
           "text": "Roberto: Decision: v0.1 launch date is June 30. Recording it.\nPriya: Agreed. June 30."
         }
       }
     ],
     "ambiguous_items": [
       {
         "text": "Rollback runbook ownership — deferred to 'next week' with no named owner.",
         "verbatim": true,
         "quoted_span": {
           "start_char": 804,
           "end_char": 854,
           "text": "Priya: We can revisit ownership of the runbook next week."
         },
         "reason": "unassigned_owner"
       },
       {
         "text": "Whether the eval corpus contribution guide ships with v0.1 or v0.2 — deferred 'offline'.",
         "verbatim": true,
         "quoted_span": {
           "start_char": 855,
           "end_char": 900,
           "text": "Priya: Let's revisit that offline."
         },
         "reason": "deferred_topic"
       }
     ],
     "eval_corpus_slice": "packages/evals/corpora/translation/meeting/v0.1.0/general.jsonl",
     "model_provenance": {
       "mode": "local",
       "provider": "ollama",
       "model": "llama3.1:8b-instruct"
     }
   }
   ```
   (Character offsets in the fixture are illustrative; the runner validates `quoted_span.text` against the actual slice of the supplied transcript, not the literal offsets.)

2. `mcp-cognitive-graph.recall_decisions({ project: "neurodock", since: "2026-04-21" })` →
   ```json
   {
     "decisions": [
       {
         "id": "ent_D_sqlitevec",
         "name": "Adopt sqlite-vec 0.2",
         "decided_on": "2026-05-07",
         "decided_by": [],
         "confidence": 1.0
       }
     ],
     "truncated": false
   }
   ```

3. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", name: "Ship v0.1 without guardrail copy; guardrails move to v0.2." }, predicate: "decided_in", object: { type: "project", name: "neurodock" }, source: "meeting transcript via asd-meeting-translator", confidence: 0.85 })` → returns a `fact_id`.

4. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", name: "Thomas cuts the guardrail section from the launch post by Monday." }, predicate: "decided_in", object: { type: "project", name: "neurodock" }, source: "meeting transcript via asd-meeting-translator", confidence: 0.85 })` → returns a `fact_id`.

5. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", name: "Thomas owns the migration script with a Wednesday deadline." }, predicate: "decided_in", object: { type: "project", name: "neurodock" }, source: "meeting transcript via asd-meeting-translator", confidence: 0.85 })` → returns a `fact_id`.

6. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", name: "v0.1 launch date is June 30." }, predicate: "decided_in", object: { type: "project", name: "neurodock" }, source: "meeting transcript via asd-meeting-translator", confidence: 0.85 })` → returns a `fact_id`.

No other tool calls. `me` is resolved from `profile.identity.display_name` without a clarifying question.

## Expected response shape

- Opens with one sentence ≤ 80 characters that contains the four integers `4`, `2`, `2`, and `2` (decisions, asks of you, asks of others, ambiguous items) in that order.
- Five labelled sections in order: `### Decisions`, `### Asks of you`, `### Asks of others`, `### Ambiguous items`, `### Prior decisions on this project (last 30 days)`.
- The Decisions section has exactly four bullets, each containing the decision text and the `decided_by` list joined with `, `.
- The Asks-of-you section has exactly two bullets. The Monday bullet contains `due Monday`; the Wednesday bullet contains `due Wednesday`.
- The Asks-of-others section has exactly two bullets. The runbook bullet contains `(no deadline stated)`.
- The Ambiguous items section has exactly two bullets. Each bullet contains the exact `quoted_span.text` returned by `brief_meeting`, wrapped in double quotes, followed by ` — unassigned_owner` and ` — deferred_topic` respectively. Both quoted spans MUST be exact substrings of the input transcript.
- The Prior decisions section is present and contains exactly one bullet quoting `Adopt sqlite-vec 0.2` with the date `2026-05-07`.
- Closing line contains `Source: meeting transcript.`, `Model: ollama/llama3.1:8b-instruct (local).`, and `Decisions written to graph: 4.`
- Total response length ≤ 2200 characters.

## Pass criteria

- [ ] Tool sequence is exactly six calls in the order above: one `brief_meeting`, one `recall_decisions`, four `record_fact`. No extra calls.
- [ ] No `record_fact` call has predicate other than `decided_in`.
- [ ] No `record_fact` call's subject corresponds to an ask or an ambiguous item.
- [ ] First sentence ≤ 80 characters and contains the four integers `4 / 2 / 2 / 2` (in order, separated by any non-digit characters).
- [ ] All five section headers are present, in the documented order.
- [ ] Both ambiguous-item bullets contain a quoted string that is a verbatim substring of the input transcript.
- [ ] Reason codes rendered are exactly `unassigned_owner` and `deferred_topic`.
- [ ] The Prior decisions section contains the exact string `Adopt sqlite-vec 0.2`.
- [ ] Closing line contains `Decisions written to graph: 4`.
- [ ] None of these substrings appear anywhere in the response: `autistic`, `neurodivergent`, `spectrum`, `executive function`, `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`, `clinical`.
- [ ] No `!` (exclamation mark) anywhere in the response.
- [ ] No second-person directive phrases: `you should`, `you need to`, `you must`.
- [ ] No follow-up question at the end (no trailing `?` after the closing line).
