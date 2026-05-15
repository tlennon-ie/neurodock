# 02 — New information resets the counter

## Scenario

User profile has `identity.neurotypes: ["ocd"]`. Local time is `2026-05-15T15:08:00+01:00`. The user has already re-validated the Postgres decision three times today (the three `tagged → "re-validated"` facts from test 01 are in the graph). However, the user's current message explicitly carries new information.

The user's invoking message is:

```
should I really go with Postgres for the cognitive graph backend? — we just got the new latency numbers from the load test, sqlite-vec is 3x faster than I thought
```

The local cognitive graph contains the same state as test 01: the `ent_01HZDEC0042` decision, the two trade-off facts, and the three prior `re-validated` tags from today.

## Expected MCP tool sequence

1. `mcp-cognitive-graph.recall_entity({ name_or_alias: "Postgres" })`
   - Returns: `entity.type == "decision"`, `entity.id == "ent_01HZDEC0042"`, the existing facts.
2. `mcp-cognitive-graph.recall_decisions({ project: "neurodock", since: "2026-05-01" })`
   - Returns: the decisions array with `ent_01HZDEC0042` at the top.
3. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", id: "ent_01HZDEC0042" }, predicate: "mentioned_in", object: { literal: "we just got the new latency numbers from the load test, sqlite-vec is 3x faster than I thought" }, source: "ocd-decision-finalizer", confidence: 0.8 })`
   - Returns: `deduplicated: false`, a new `fact_id`. This is the fresh-context record.

The skill MUST NOT additionally tag the decision with `re-validated`. The fresh-context branch skips that write entirely — that is the whole point of the counter reset.

## Expected response shape

A **normal** response to the user's question, not the four-section finality shape. The skill addresses the latency-numbers question directly. One additional sentence is appended noting that the new information was recorded against the decision so future re-validation counts start from the new evidence.

Approximate envelope: ≤ 1500 characters total. Length is bounded by "the model's normal answer to a Postgres-vs-sqlite-vec question" plus the one acknowledgement sentence.

The acknowledgement sentence MUST appear and MUST name what was recorded. Shape:

```
Logged the new latency observation against the Postgres decision in your graph;
treating this as fresh context.
```

(Exact wording may vary across LLM clients; the test scores on the presence of the words `logged`, `new`, `latency` or the user's exact new fact, and `fresh context`.)

## Pass criteria

- [ ] The response is the **normal** mode, not finality mode. There is no `### What was decided` section. There is no `### The grounded reply` line. There is no override line.
- [ ] The skill called `record_fact` with `predicate: "mentioned_in"` exactly once, with `object.literal` matching the verbatim user-supplied new fact (truncated to ≤ 200 chars if longer). `confidence: 0.8`.
- [ ] The skill did NOT call `record_fact` with `predicate: "tagged"` and `object.literal: "re-validated"`. (A `re-validated` write on a fresh-context activation is a critical regression.)
- [ ] The response includes a single acknowledgement sentence stating that the new information was logged against the decision and that the skill is treating this as fresh context.
- [ ] The skill does NOT lecture the user about "this is your fourth time asking". The counter does not surface in fresh-context mode.
- [ ] None of the prohibited phrases appears.
- [ ] The response engages with the actual question (whether the new latency numbers change the Postgres-vs-sqlite-vec balance). It does not deflect.
- [ ] The decision name, when referenced in the acknowledgement, is the verbatim `decisions[0].name` from the graph.
