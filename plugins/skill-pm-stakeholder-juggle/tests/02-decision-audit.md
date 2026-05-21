# Test 02 — Flow B: decision audit with the verbatim anti-rumination closing line

**Scenario:** User says `audit my decisions on migration-q2`. The cognitive graph has three decisions recorded against the project, ordered newest-first as the schema guarantees. The skill renders them in order and appends the load-bearing anti-rumination closing line. This test hard-asserts that closing line is present verbatim.

The anti-rumination close is the load-bearing property of this flow. The skill exists for the OCD-prone PM who re-litigates already-made decisions in their head. The line surfaces the closed calls AND names them as closed AND names the path to reopen. Softening it (e.g. "These decisions are mostly closed", or "but you can revisit anytime") would undermine the whole point.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-cognitive-graph` IS mocked as available.
`neurodock-task-fractionator` IS mocked as available but unused in this flow.

Mocked `recall_decisions({ "project": "migration-q2" })` returns:

```json
{
  "project": {
    "id": "ent_01HZPRJMIGRATIONQ2",
    "name": "migration-q2"
  },
  "decisions": [
    {
      "id": "ent_01HZDEC0003",
      "name": "Cut the read-replica from the Q2 scope; revisit in Q3 after the connection-pool work lands",
      "decided_on": "2026-05-10",
      "decided_by": [
        {
          "type": "person",
          "id": "ent_01HZPERSPRIYA",
          "name": "Priya"
        },
        {
          "type": "person",
          "id": "ent_01HZPERSROBERTO",
          "name": "Roberto"
        }
      ],
      "source": "https://github.com/example-org/migration-q2/issues/214",
      "confidence": 0.9,
      "supersedes": null
    },
    {
      "id": "ent_01HZDEC0002",
      "name": "Adopt logical replication for the cutover, not pg_dump+restore",
      "decided_on": "2026-04-18",
      "decided_by": [
        {
          "type": "person",
          "id": "ent_01HZPERSALEX",
          "name": "Alex"
        }
      ],
      "source": "msg://slack/C123/p1713440000000100",
      "confidence": 1.0,
      "supersedes": null
    },
    {
      "id": "ent_01HZDEC0001",
      "name": "Freeze the schema as of v47 for the duration of the cutover window",
      "decided_on": "2026-03-29",
      "decided_by": [],
      "source": null,
      "confidence": 1.0,
      "supersedes": null
    }
  ],
  "truncated": false,
  "since": null
}
```

## User prompt

> audit my decisions on migration-q2

## Expected tool calls (in order)

1. `recall_decisions({ "project": "migration-q2" })` — single call with the parsed project reference verbatim, no `since` filter.

That is the only tool call in this flow. `recall_entity`, `decompose`, and `record_fact` MUST NOT be called.

## Expected output

```
Decision audit — migration-q2. 3 decisions on file.

1. Cut the read-replica from the Q2 scope; revisit in Q3 after the connection-pool work lands — decided 2026-05-10. Decided by Priya, Roberto. Source: https://github.com/example-org/migration-q2/issues/214.
2. Adopt logical replication for the cutover, not pg_dump+restore — decided 2026-04-18. Decided by Alex. Source: msg://slack/C123/p1713440000000100.
3. Freeze the schema as of v47 for the duration of the cutover window — decided 2026-03-29. Attribution: unattributed.

These decisions are closed. To reopen, open a new question.
```

## Pass criteria specific to this test

**Tool-call correctness:**

- Exactly one tool call: `recall_decisions` with `project == "migration-q2"` (verbatim) and no `since` field.
- No call to `recall_entity`, `decompose`, `record_fact`, `mark_session_start`, `mark_session_end`, or `get_time_context`.

**Anti-rumination closing line (THE load-bearing property of this flow):**

- The output's final line is exactly the literal string `These decisions are closed. To reopen, open a new question.`
- The line appears verbatim. No paraphrase. The following are all FAILURES:
  - `These decisions are closed. You can reopen anytime by asking a new question.`
  - `These decisions are mostly closed. Let me know if you want to reopen one.`
  - `These decisions are closed — to reopen, open a new question.` (em-dash instead of period)
  - `(These decisions are closed. To reopen, open a new question.)` (parentheses)
  - The line followed by ANY additional content (e.g. a sympathy line, an offer to help, "anything else?").
- The literal substring `"These decisions are closed. To reopen, open a new question."` appears EXACTLY ONCE in the output.

**Temporal-order correctness:**

- Decisions are numbered 1, 2, 3 newest-first (matching the schema's ordering).
- Decision 1 is the 2026-05-10 decision, decision 2 is the 2026-04-18 decision, decision 3 is the 2026-03-29 decision.

**Verbatim quoting of decision names:**

- The literal substring `"Cut the read-replica from the Q2 scope; revisit in Q3 after the connection-pool work lands"` appears in the output.
- The literal substring `"Adopt logical replication for the cutover, not pg_dump+restore"` appears in the output.
- The literal substring `"Freeze the schema as of v47 for the duration of the cutover window"` appears in the output.

**Attribution correctness:**

- Decision 1's attribution line is `Decided by Priya, Roberto.` (two attributees, comma-separated).
- Decision 2's attribution line is `Decided by Alex.` (one attributee).
- Decision 3's attribution line is `Attribution: unattributed.` (empty `decided_by` array → unattributed fallback).

**Source-line correctness:**

- Decision 1 includes `Source: https://github.com/example-org/migration-q2/issues/214.` (URL verbatim).
- Decision 2 includes `Source: msg://slack/C123/p1713440000000100.` (source verbatim).
- Decision 3 OMITS the `Source:` line entirely (source is null — line is dropped, not rendered as `Source: null`).

**Voice and banned phrases:**

- The skill does NOT propose reopening any decision. The phrases `"want to reopen"`, `"shall we revisit"`, `"let me know if"`, `"anything else"` MUST NOT appear in skill output.
- The skill does NOT editorialise about whether the decisions were good. The phrases `"good call"`, `"right call"`, `"that decision was"`, `"in hindsight"` MUST NOT appear.
- No words from the banlist: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`, `aligned`, `north star`, `circle back`, `actionable insights`.
- No clinical framing: the words `rumination`, `obsessive`, `compulsive`, `OCD`, `anxiety`, `executive function` MUST NOT appear. The anti-rumination shape is implicit in the closing line, not named.
- No sympathy theatre: `that's tough`, `it's hard when`, `sorry you're` MUST NOT appear.
- Universal pass criteria (see `README.md`) all hold.
