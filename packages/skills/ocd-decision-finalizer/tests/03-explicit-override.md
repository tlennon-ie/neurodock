# 03 — Explicit override

## Scenario

User profile has `identity.neurotypes: ["ocd"]`. Local time is `2026-05-15T16:20:00+01:00`. The graph state matches test 01 — three prior `re-validated` tags exist against `ent_01HZDEC0042` today, and the skill would otherwise enter finality mode. The user has read the prior finality response and chosen to override.

The user's invoking message is:

```
should I really go with Postgres for the cognitive graph backend? --override "fresh-context"
```

## Expected MCP tool sequence

1. `mcp-cognitive-graph.recall_entity({ name_or_alias: "Postgres" })`
   - Returns: `entity.type == "decision"`, `entity.id == "ent_01HZDEC0042"`, the existing facts.
2. `mcp-cognitive-graph.recall_decisions({ project: "neurodock", since: "2026-05-01" })`
   - Returns: the decisions array with `ent_01HZDEC0042` at the top.
3. `mcp-cognitive-graph.record_fact({ subject: { type: "decision", id: "ent_01HZDEC0042" }, predicate: "tagged", object: { literal: "override:fresh-context" }, source: "ocd-decision-finalizer", confidence: 1.0 })`
   - Returns: `deduplicated: false`, a new `fact_id`. This is the audit row.

The skill MUST NOT also write a `re-validated` tag on this activation. The override branch records the override only.

## Expected response shape

A **normal** response, not the four-section finality shape. The skill engages with the user's Postgres question directly. One short prefix line acknowledges the override.

Approximate envelope: ≤ 1500 characters total. The acknowledgement prefix MUST appear at the top of the response. Shape:

```
Override accepted. Logged locally only; not transmitted.
```

(Exact wording may vary; the test scores on presence of `override`, `accepted` (or equivalent), and the `locally only` or `not transmitted` clause.)

After the prefix, the response is whatever the model would normally produce for "should I really go with Postgres?" — a substantive, balanced answer drawing on the recorded trade-offs from the graph.

## Pass criteria

- [ ] The response is the **normal** mode, not finality mode. There is no `### What was decided` section. There is no `### The grounded reply` sentence. There is no override-instructions line (the user has already used the override).
- [ ] The first line of the response acknowledges the override, names that it is logged locally only, and does not say "are you sure" or otherwise second-guess the user.
- [ ] The skill called `record_fact` exactly once, with `predicate: "tagged"` and `object.literal: "override:fresh-context"`. `confidence: 1.0`. `source: "ocd-decision-finalizer"`.
- [ ] The skill did NOT call `record_fact` with `object.literal: "re-validated"`. (The override branch suppresses the re-validation tag — if the override also incremented the counter, a user could never escape finality.)
- [ ] The skill engages with the actual question. It does not deflect, does not refuse, does not patronise.
- [ ] None of the prohibited phrases appears.
- [ ] The audit row is local-only. No part of the response, and no other tool call, transmits the override token off-device. (Verified by checking the call trace contains no calls other than the three listed above, and the SKILL.md `mcp_dependencies` block is exhaustive.)
- [ ] The decision name, if referenced in the response, is verbatim from the graph.
