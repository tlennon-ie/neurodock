---
name: record-fact
description: Persist a subject-predicate-object fact in the local cognitive graph. Load this BEFORE calling record_fact to send the correct input shape on the first attempt.
---

# record-fact

Wrapper around `mcp__neurodock-cognitive-graph__record_fact` that shows
the exact valid input shape up front. The bare tool has strict validation;
load this skill first and call it correctly on the first attempt.

Authoritative schema `$id`:
`https://schemas.neurodock.org/mcp-cognitive-graph/v0.1.0/record_fact.schema.json`
([source](https://github.com/tlennon-ie/neurodock/blob/main/packages/mcp-cognitive-graph/schemas/record_fact.schema.json)).

## When to use

- The user says "remember X", "make a note that X", "log that X".
- A skill needs to persist an attribution, a decision, a dependency, or a
  tag into the graph.
- After a meeting brief identifies a commitment worth retaining.

## The shape you MUST send

A fact is a **triple**: `subject`, `predicate`, `object`. Flat shapes like
`{fact: "..."}` are rejected with `SUBJECT_REQUIRED`. Subject and object
are **entity dictionaries**, not strings.

### Entity dictionary

```json
{ "type": "<entity-type>", "name": "<display name>" }
```

Optional `id` field if you already know the canonical id.

### v0.1.0 entity types (closed enum)

- `person`
- `project`
- `decision`
- `concept`
- `source`

Common wrong values that get rejected: `feature`, `bug`, `task`, `note`,
`user`, `goal`. Map them: a feature is a `concept`; a person's name is
`person`; an architectural choice is `decision`.

### v0.1.0 predicates (closed enum)

- `mentioned_in`
- `decided_in`
- `reports_to`
- `depends_on`
- `resolved_by`
- `blocked_by`
- `tagged`
- `belongs_to`

Common wrong values: `has_bug`, `is_a`, `causes`. Free-form predicates land
in v0.2 via `type_extensions`. For v0.1.0, pick the closest verb above —
most situations map to `blocked_by`, `depends_on`, `mentioned_in`, or
`tagged`.

### Object can be a literal

When the object is a tag, status, or short note rather than an entity:

```json
{ "literal": "external-memory" }
```

## How to invoke — canonical examples

### Example 1: a decision attribution

```json
{
  "subject": { "type": "person", "name": "Roberto" },
  "predicate": "decided_in",
  "object": { "type": "decision", "name": "Adopt SQLite + sqlite-vec" },
  "source": "msg://slack/C123/p1715683200000100",
  "confidence": 1.0
}
```

### Example 2: a dependency between concepts

```json
{
  "subject": { "type": "project", "name": "NeuroDock" },
  "predicate": "depends_on",
  "object": { "type": "concept", "name": "sqlite-vec" }
}
```

### Example 3: a tag (object is a literal)

```json
{
  "subject": { "type": "project", "name": "NeuroDock" },
  "predicate": "tagged",
  "object": { "literal": "external-memory" },
  "confidence": 0.8
}
```

### Example 4: a bug-blocks-a-feature relationship

User says "remember that the Gmail translation bug is blocking the LM Studio launch".
Both sides model as `concept` because v0.1.0 has no `feature` or `bug` type:

```json
{
  "subject": { "type": "concept", "name": "LM Studio launch" },
  "predicate": "blocked_by",
  "object": { "type": "concept", "name": "Gmail translation silent failure" }
}
```

## Errors and how to recover

| Error                     | Cause                             | Fix                                            |
| ------------------------- | --------------------------------- | ---------------------------------------------- |
| `SUBJECT_REQUIRED`        | Sent a flat string or missing key | Wrap as `{"type": "...", "name": "..."}`       |
| `OBJECT_REQUIRED`         | Same on object                    | Same fix, or use `{"literal": "..."}`          |
| `PREDICATE_UNKNOWN`       | Predicate not in the closed enum  | Pick from the eight above                      |
| `ENTITY_TYPE_UNKNOWN`     | Type not in the closed enum       | Pick from the five above                       |
| `CONFIDENCE_OUT_OF_RANGE` | Confidence outside [0, 1]         | Clamp                                          |
| `GRAPH_WRITE_FAILED`      | SQLite store rejected the write   | Retry once; if persistent, surface to the user |

## Side effects

- Auto-creates referenced entities by `(type, name)` if they do not exist.
- Returns `auto_created_entities[]` so callers can show what was created.
- Idempotent at `(subject, predicate, object)` — duplicate calls return the
  same `fact_id` with `deduplicated: true`.

## Limitations

- v0.1.0 vocabulary is small. If nothing fits, model it as `tagged` with a
  literal object and revisit when v0.2 extension predicates land.
- Auto-create can fragment the graph if you keep creating `concept`
  entities from long free-text descriptions. Prefer short canonical names
  ("Gmail translation bug") over sentences.
- The tool is local-only; no remote sync in v0.1.0.

## Voice

If you need to translate the user's plain English into a triple, show the
mapping briefly ("logging this as `concept blocked_by concept`") so the
user can correct you in one turn. Do not dump the full schema at them.
Quote any `auto_created_entities` back so they can spot duplicates.
