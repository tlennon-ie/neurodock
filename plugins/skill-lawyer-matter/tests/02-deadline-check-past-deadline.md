# Test 02 — Flow B: deadline check including a past deadline

**Scenario:** User says `deadline check for the next 14 days`. The user supplies `all` as the scope. The cognitive graph returns three deadline facts across two matters within (or just past) the 14-day window. One deadline is in the past — the skill MUST flag it with the literal string `PAST DEADLINE` in capitals, MUST NOT soften it, and MUST NOT add hedging language like "you may want to check on this". Today (test fixture date) is `2026-05-21`.

This test is the load-bearing assertion for the skill's posture: lawyers respect precision, and softening a missed deadline is the opposite of precision.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
```

`neurodock-cognitive-graph` IS mocked as available.

Today (test fixture date): `2026-05-21`.

The user has two active matters: `Acme Corp v Beta Holdings` and `Re Smith Estate`. The skill, after the user answers `all` to the scope question, calls `recall_entity` once per matter and aggregates the `deadline:`-prefixed facts.

Mocked `recall_entity({ "name_or_alias": "Acme Corp v Beta Holdings" })` returns one deadline fact:

```json
{
  "entity": {
    "id": "p9a8b7c6-d5e4-4321-fedc-ba9876543210",
    "type": "project",
    "name": "Acme Corp v Beta Holdings",
    "aliases": [],
    "last_interaction_at": "2026-05-18T16:45:00+01:00"
  },
  "facts": [
    {
      "fact_id": "fa1a1a1a-2b2b-4c3c-8d4d-5e5e5e5e5e5e",
      "subject": {
        "type": "project",
        "id": "p9a8b7c6-d5e4-4321-fedc-ba9876543210"
      },
      "predicate": "tagged",
      "object": {
        "literal": "deadline:2026-06-03: serve witness statement"
      },
      "recorded_at": "2026-05-10T09:30:00+01:00"
    }
  ],
  "neighbours": [],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

Mocked `recall_entity({ "name_or_alias": "Re Smith Estate" })` returns two deadline facts (one past, one today):

```json
{
  "entity": {
    "id": "p7c6b5a4-9876-4321-fedc-0123456789ab",
    "type": "project",
    "name": "Re Smith Estate",
    "aliases": [],
    "last_interaction_at": "2026-05-19T10:00:00+01:00"
  },
  "facts": [
    {
      "fact_id": "fb1b1b1b-2c2c-4d3d-8e4e-5f5f5f5f5f5f",
      "subject": {
        "type": "project",
        "id": "p7c6b5a4-9876-4321-fedc-0123456789ab"
      },
      "predicate": "tagged",
      "object": {
        "literal": "deadline:2026-05-19: file inventory of estate assets"
      },
      "recorded_at": "2026-05-01T09:00:00+01:00"
    },
    {
      "fact_id": "fc1c1c1c-2d2d-4e3e-8f4f-606060606060",
      "subject": {
        "type": "project",
        "id": "p7c6b5a4-9876-4321-fedc-0123456789ab"
      },
      "predicate": "tagged",
      "object": {
        "literal": "deadline:2026-05-21: respond to caveat lodged by third party"
      },
      "recorded_at": "2026-05-15T11:00:00+01:00"
    }
  ],
  "neighbours": [],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

Note: the `Re Smith Estate` inventory deadline (`2026-05-19`) is two days past today's fixture date (`2026-05-21`). That is the PAST DEADLINE case.

## User prompts (in order)

Turn 1:

> deadline check for the next 14 days

Turn 2 (answering the scope question):

> all

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "Acme Corp v Beta Holdings" })` — in turn 2, after the user supplies the scope.
2. `recall_entity({ "name_or_alias": "Re Smith Estate" })` — in turn 2, in the same aggregation pass.

Two `recall_entity` calls total. No `record_fact`, no `recall_decisions`, no `mcp-translation` tool call.

(The order of the two `recall_entity` calls is implementation-defined; both orderings are acceptable as long as the rendered output sorts by deadline date as specified below.)

## Expected output

Turn 1 response:

```
Which matter or matter-set should I scan? (Use "all" to scan every project entity touched in the last 90 days.)
```

Turn 2 response:

```
Deadline check — next 14 days. 3 deadlines on file.

- 2026-05-19 — Re Smith Estate — file inventory of estate assets — PAST DEADLINE (2 days overdue)
- 2026-05-21 — Re Smith Estate — respond to caveat lodged by third party — due today
- 2026-06-03 — Acme Corp v Beta Holdings — serve witness statement — 13 days remaining
```

## Pass criteria specific to this test

**The load-bearing PAST DEADLINE assertions:**

- The literal substring `PAST DEADLINE` appears in the output (in capitals, verbatim, on the line for the 2026-05-19 deadline).
- The literal substring `2 days overdue` appears on the same line as `PAST DEADLINE`.
- The output does NOT contain any softening of the missed deadline. The following literal substrings MUST NOT appear anywhere in skill-generated output: `you may want to check on this`, `appears to have slipped`, `looks like this is overdue`, `seems to be`, `might want to`, `consider checking`, `worth following up`, `flag this`. (Test the substring matches case-insensitively.)
- The output does NOT contain the words `oversight`, `unfortunately`, `regrettably`, or any apologetic framing.
- The PAST DEADLINE line is the first line under the header — past deadlines sort to the top.

**Structural correctness:**

- Exactly two tool calls, both `recall_entity`, both in turn 2.
- Turn 1 response is exactly the one-line scope question. No editorial framing, no list of matters.
- Turn 2 header line: `Deadline check — next 14 days. 3 deadlines on file.` (verbatim).
- Three lines under the header, in this exact order:
  1. The PAST DEADLINE line for `Re Smith Estate` / `file inventory of estate assets`.
  2. The `due today` line for `Re Smith Estate` / `respond to caveat lodged by third party`.
  3. The future line for `Acme Corp v Beta Holdings` / `serve witness statement` / `13 days remaining`.
- Each deadline line includes: the ISO date, the matter name, the description verbatim, and the days-remaining annotation.
- The description text (`file inventory of estate assets`, `respond to caveat lodged by third party`, `serve witness statement`) appears verbatim — not paraphrased.

**Voice and banned phrases:**

- The output does NOT contain any of these words as skill-generated commentary: `should`, `must`, `obligated`, `liable`, `entitled`, `actionable`, `merits`.
- The output does NOT contain `advice`, `recommend`, `suggest`, or any framing of the list as advice.
- The output does NOT propose remediation (no "draft a motion to extend", no "file an out-of-time application").
- The output does NOT include a closing exhortation (no "let me know if you need more", no "anything else?", no "good luck").
- No words from a general manager-speak banlist: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`. (Carried over from sibling skills for consistency.)
- Universal pass criteria (see `README.md`) all hold.
