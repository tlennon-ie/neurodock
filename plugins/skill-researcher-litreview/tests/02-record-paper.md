# Test 02 — Flow B: record a paper with two co-authors

**Scenario:** User says `add a paper: Where Action Meets Cognition, Anderson and Lee, 2019`. The skill parses title / authors / year, then calls `record_fact` four times: one to tag the paper, one to tag the year, and one `belongs_to` edge per author. It does NOT invent an abstract, a DOI, a venue, or any field the user did not type.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-task-fractionator` is mocked as available (unused in this flow).
`neurodock-cognitive-graph` IS mocked as available.

Mocked `record_fact` accepts any of the four calls below and returns `{ "ok": true, "fact_id": "<uuid>" }` for each (UUIDs unchecked).

## User prompt

> add a paper: Where Action Meets Cognition, Anderson and Lee, 2019

## Expected tool calls (in order)

1. `record_fact({ "subject": { "type": "concept", "name": "Where Action Meets Cognition" }, "predicate": "tagged", "object": { "literal": "paper" } })`
2. `record_fact({ "subject": { "type": "concept", "name": "Where Action Meets Cognition" }, "predicate": "tagged", "object": { "literal": "year:2019" } })`
3. `record_fact({ "subject": { "type": "concept", "name": "Where Action Meets Cognition" }, "predicate": "belongs_to", "object": { "type": "person", "name": "Anderson" } })`
4. `record_fact({ "subject": { "type": "concept", "name": "Where Action Meets Cognition" }, "predicate": "belongs_to", "object": { "type": "person", "name": "Lee" } })`

Exactly four `record_fact` calls. No other tool calls. `decompose` and `recall_entity` MUST NOT be called.

## Expected output

```
Recorded: "Where Action Meets Cognition" (2019), by Anderson and Lee.
Graph entries: 1 paper, 2 author(s), 4 facts.
```

## Pass criteria specific to this test

**Parsing correctness:**

- Title is `Where Action Meets Cognition` (verbatim, including the original capitalisation). Title is NOT normalised to title-case or sentence-case.
- Authors are `Anderson` and `Lee` (two distinct strings, split on the literal `and`).
- Year is `2019` (parsed as integer, in range 1500..current_year+1).

**Tool-call correctness:**

- Exactly four `record_fact` calls in the order specified above. The order matters: paper tag first, then year tag, then authors in the order they appeared in the input.
- Each call uses `subject.type = "concept"` and `subject.name = "Where Action Meets Cognition"` (verbatim).
- The paper-tag call uses `predicate: "tagged"` and `object.literal: "paper"`.
- The year-tag call uses `predicate: "tagged"` and `object.literal: "year:2019"`.
- Both author calls use `predicate: "belongs_to"` and `object.type: "person"`.
- No call to `recall_entity`.
- No call to `decompose`.

**No-invention assertions (the load-bearing property):**

- The skill MUST NOT call `record_fact` with any additional metadata the user did not provide: no abstract, no DOI, no venue, no journal, no page numbers, no URL, no keywords, no `cited_by` edges, no related-paper tags.
- The skill MUST NOT invent an author the user did not type. The pre-condition input had `Anderson and Lee` — exactly two authors. Calls 3 and 4 carry exactly those two names.
- The skill MUST NOT split a single author name across multiple `record_fact` calls. `Anderson` is one author entity, not "An" plus "derson".
- The skill MUST NOT normalise author names (`Anderson` does not become `Anderson, John` or `J. Anderson`).
- The skill MUST NOT expand the year (`2019` does not become `2019-01-01` or any timestamp).

**Output assertions:**

- The output contains the literal substring `"Where Action Meets Cognition"` (verbatim title).
- The output contains the literal substring `(2019)`.
- The author rendering is `by Anderson and Lee` — comma joining for ≥3 authors, `and` for the last two; with exactly two authors, no comma.
- The fact count line reads exactly `Graph entries: 1 paper, 2 author(s), 4 facts.`
- The skill does NOT ask a follow-up question (`Add another?`, `Want to tag this with a topic?`, `Should I link this to a project?`). Output stops after the fact-count line.
- No words from the banlist: `seminal`, `influential`, `highly cited`, `important paper`.
- No editorialisation. The skill does NOT say "good choice" or "I recognise this paper".
- Universal pass criteria (see `README.md`) all hold.
