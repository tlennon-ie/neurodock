# Test 02 — ambiguous "can we revisit X next week" language

## Scenario

It is Tuesday 2026-05-26, 16:15 local time. The user — display name `Thomas` — pastes a short three-speaker transcript with `/brief`. No project name is supplied in the trigger and none is detectable in the transcript. The profile sets `identity.display_name: "Thomas"`, `identity.neurotypes: ["asd"]`. The local cognitive graph is irrelevant for this test because `project` is unset — `recall_decisions` MUST NOT be called.

This is the classic corporate-ambiguity case from `plan.md` §7: "can we revisit X next week" is the canonical phrase the translation layer must surface as vague rather than as a commitment. The skill must detect the ambiguity, quote the verbatim transcript span, name the reason as `vague_timeline` (the schema's term for "no committed timing"), and ask **no** clarifying follow-up. The user reads the brief and decides what to do.

Transcript:

```
Priya: Quick one — the customer-success deck. Should we update it for the launch or leave it?
Thomas: I have capacity this week if it matters for launch.
Priya: Can we revisit that next week? I want to check with Sam first.
Thomas: Sure.
```

## Expected MCP tool sequence

1. `mcp-translation.brief_meeting({ transcript: "<the transcript above>", me: "Thomas" })` (no `project` arg) →
   ```json
   {
     "my_asks": [],
     "others_asks": [],
     "decisions": [],
     "ambiguous_items": [
       {
         "text": "Whether to update the customer-success deck for launch — deferred to 'next week' pending Priya's check with Sam.",
         "verbatim": true,
         "quoted_span": {
           "start_char": 152,
           "end_char": 220,
           "text": "Priya: Can we revisit that next week? I want to check with Sam first."
         },
         "reason": "vague_timeline"
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
   (Character offsets are illustrative; the runner validates `quoted_span.text` against the actual slice of the supplied transcript.)

No other tool calls. Specifically:

- `recall_decisions` MUST NOT be called because `project` is unset.
- `record_fact` MUST NOT be called because `decisions` is empty.

## Expected response shape

- Opens with one sentence ≤ 80 characters that contains the four integers `0`, `0`, `0`, `1` (decisions, asks of you, asks of others, ambiguous items).
- Four labelled sections in order: `### Decisions`, `### Asks of you`, `### Asks of others`, `### Ambiguous items`.
- The Decisions, Asks-of-you, and Asks-of-others sections each contain exactly one bullet `- (none)`.
- The Ambiguous items section contains exactly one bullet quoting `Priya: Can we revisit that next week? I want to check with Sam first.` verbatim (in double quotes) followed by ` — vague_timeline`.
- There is no `### Prior decisions on this project (last 30 days)` section (project was unset).
- Closing line contains `Source: meeting transcript.`, `Model: ollama/llama3.1:8b-instruct (local).`, and `Decisions written to graph: 0.`
- Total response length ≤ 700 characters.

## Pass criteria

- [ ] Exactly one MCP tool call: `brief_meeting` with no `project` argument and `me="Thomas"`.
- [ ] No call to `recall_decisions`.
- [ ] No call to `record_fact`.
- [ ] First sentence ≤ 80 characters and contains the integers `0 / 0 / 0 / 1` (in order).
- [ ] Four section headers exactly: `### Decisions`, `### Asks of you`, `### Asks of others`, `### Ambiguous items`. No fifth "Prior decisions" header.
- [ ] The Ambiguous items bullet contains the exact substring `"Priya: Can we revisit that next week? I want to check with Sam first."` (with the speaker label, the question mark, and the second sentence intact).
- [ ] Reason code rendered is exactly `vague_timeline`.
- [ ] The response contains NO clarifying follow-up: no string matching `?` after the closing line, no phrase `do you want`, no phrase `should I`, no phrase `let me know`.
- [ ] None of these substrings appear: `autistic`, `neurodivergent`, `spectrum`, `executive function`, `superpower`, `crusher`, `smash`, `you got this`, `differently abled`, `clinical`.
- [ ] Closing line contains `Decisions written to graph: 0`.
- [ ] No `!` (exclamation mark) anywhere in the response.
