# Test 02 — Flow B: synthesise consultation responses with verbatim quoting and zero editorial commentary

**Scenario:** User says `synthesise stakeholder responses on the Planning Act consultation`. The cognitive graph has a consultation entity with three stakeholder neighbours (a representative body that supports, an NGO that objects, an academic group whose position constitutes a principled disagreement with the representative body on one sub-issue). The skill produces a structured map with positions quoted VERBATIM from the recalled facts — zero editorial commentary, zero characterisation of any position as "reasonable", "extreme", or "balanced".

This test is the most behaviour-heavy of the three because it must assert what the skill says AND what it does not say. Verbatim discipline is the load-bearing property.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
```

`neurodock-task-fractionator` is mocked as available but unused in this flow.
`neurodock-cognitive-graph` IS mocked as available.

Mocked `recall_entity({ "name_or_alias": "the Planning Act consultation" })` returns:

```json
{
  "entity": {
    "id": "c1d2e3f4-a5b6-4789-90ab-cdef12345678",
    "type": "consultation",
    "name": "the Planning Act consultation",
    "aliases": ["Planning Act 2026 consultation"],
    "last_interaction_at": "2026-05-15T10:00:00+01:00"
  },
  "facts": [],
  "neighbours": [
    {
      "entity": {
        "type": "organisation",
        "id": "o1a2b3c4-d5e6-4789-90ab-cdef00000001",
        "name": "Construction Industry Federation"
      },
      "relationship": "responded_to"
    },
    {
      "entity": {
        "type": "organisation",
        "id": "o2a2b3c4-d5e6-4789-90ab-cdef00000002",
        "name": "Friends of the Irish Environment"
      },
      "relationship": "responded_to"
    },
    {
      "entity": {
        "type": "organisation",
        "id": "o3a2b3c4-d5e6-4789-90ab-cdef00000003",
        "name": "UCD Planning Research Group"
      },
      "relationship": "responded_to"
    }
  ],
  "resolution": {
    "method": "exact",
    "score": 1.0
  },
  "truncated_facts": false
}
```

Mocked `recall_entity({ "name_or_alias": "Construction Industry Federation" })` returns:

```json
{
  "entity": {
    "id": "o1a2b3c4-d5e6-4789-90ab-cdef00000001",
    "type": "organisation",
    "name": "Construction Industry Federation",
    "aliases": ["CIF"],
    "last_interaction_at": "2026-05-10T14:00:00+01:00"
  },
  "facts": [
    {
      "fact_id": "f001",
      "subject": {
        "type": "organisation",
        "id": "o1a2b3c4-d5e6-4789-90ab-cdef00000001"
      },
      "predicate": "supports",
      "object": {
        "literal": "the Planning Act consultation — endorses the proposed shortened judicial review window as essential for delivery certainty"
      },
      "recorded_at": "2026-05-10T14:00:00+01:00"
    }
  ],
  "neighbours": [],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

Mocked `recall_entity({ "name_or_alias": "Friends of the Irish Environment" })` returns:

```json
{
  "entity": {
    "id": "o2a2b3c4-d5e6-4789-90ab-cdef00000002",
    "type": "organisation",
    "name": "Friends of the Irish Environment",
    "aliases": ["FIE"],
    "last_interaction_at": "2026-05-12T09:00:00+01:00"
  },
  "facts": [
    {
      "fact_id": "f002",
      "subject": {
        "type": "organisation",
        "id": "o2a2b3c4-d5e6-4789-90ab-cdef00000002"
      },
      "predicate": "objects_to",
      "object": {
        "literal": "the Planning Act consultation — opposes the shortened judicial review window on the grounds that it weakens Aarhus Convention access-to-justice obligations"
      },
      "recorded_at": "2026-05-12T09:00:00+01:00"
    }
  ],
  "neighbours": [],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

Mocked `recall_entity({ "name_or_alias": "UCD Planning Research Group" })` returns:

```json
{
  "entity": {
    "id": "o3a2b3c4-d5e6-4789-90ab-cdef00000003",
    "type": "organisation",
    "name": "UCD Planning Research Group",
    "aliases": [],
    "last_interaction_at": "2026-05-14T16:30:00+01:00"
  },
  "facts": [
    {
      "fact_id": "f003",
      "subject": {
        "type": "organisation",
        "id": "o3a2b3c4-d5e6-4789-90ab-cdef00000003"
      },
      "predicate": "disagrees_with",
      "object": {
        "literal": "the Planning Act consultation — on shortened judicial review window: empirical evidence from 2018-2024 shows that fewer than 6% of major housing delays are attributable to judicial review; shortening the window does not address the dominant delay sources"
      },
      "recorded_at": "2026-05-14T16:30:00+01:00"
    }
  ],
  "neighbours": [],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

The shared sub-issue across all three stakeholders is `shortened judicial review window`, which appears verbatim in the literal of each fact. This is the basis for the principled-disagreement section.

## User prompt

> synthesise stakeholder responses on the Planning Act consultation

## Expected tool calls (in order)

1. `recall_entity({ "name_or_alias": "the Planning Act consultation" })`
2. `recall_entity({ "name_or_alias": "Construction Industry Federation" })`
3. `recall_entity({ "name_or_alias": "Friends of the Irish Environment" })`
4. `recall_entity({ "name_or_alias": "UCD Planning Research Group" })`

Four `recall_entity` calls, in that order. No other tool calls. `decompose`, `record_fact`, `mark_session_start`, and `request_break_if_needed` MUST NOT be called.

## Expected output

```
Stakeholder synthesis — the Planning Act consultation. 3 stakeholders, 3 recorded positions.

### Supports
- Construction Industry Federation: "the Planning Act consultation — endorses the proposed shortened judicial review window as essential for delivery certainty" (recorded 2026-05-10)

### Objects
- Friends of the Irish Environment: "the Planning Act consultation — opposes the shortened judicial review window on the grounds that it weakens Aarhus Convention access-to-justice obligations" (recorded 2026-05-12)

### Principled disagreements
- On shortened judicial review window:
  - Construction Industry Federation: "the Planning Act consultation — endorses the proposed shortened judicial review window as essential for delivery certainty"
  - Friends of the Irish Environment: "the Planning Act consultation — opposes the shortened judicial review window on the grounds that it weakens Aarhus Convention access-to-justice obligations"
  - UCD Planning Research Group: "the Planning Act consultation — on shortened judicial review window: empirical evidence from 2018-2024 shows that fewer than 6% of major housing delays are attributable to judicial review; shortening the window does not address the dominant delay sources"

This is structured recall. Every position is quoted from the graph verbatim. The synthesis does not weight, rank, or characterise the views.
```

## Pass criteria specific to this test

**Verbatim discipline (the load-bearing property):**

- Every stakeholder position appearing in the output is enclosed in double quotes and matches the corresponding `fact.object.literal` from the mocked recall responses CHARACTER-FOR-CHARACTER. Specifically, all three of these literal substrings appear in the output:
  - `"the Planning Act consultation — endorses the proposed shortened judicial review window as essential for delivery certainty"`
  - `"the Planning Act consultation — opposes the shortened judicial review window on the grounds that it weakens Aarhus Convention access-to-justice obligations"`
  - `"the Planning Act consultation — on shortened judicial review window: empirical evidence from 2018-2024 shows that fewer than 6% of major housing delays are attributable to judicial review; shortening the window does not address the dominant delay sources"`
- No paraphrase appears. The skill does not say "broadly supports", "raises concerns", "argues that", "points out", "claims that" — it quotes.

**Zero editorial commentary (the load-bearing property):**

- The literal substrings `"reasonable"`, `"a reasonable view"`, `"reasonable position"` MUST NOT appear in skill output.
- The literal substrings `"extreme"`, `"an extreme position"`, `"an outlier"`, `"a minority view"`, `"a fringe view"`, `"a controversial view"` MUST NOT appear.
- The literal substrings `"balanced"`, `"the balanced view"`, `"middle ground"`, `"sensible compromise"` MUST NOT appear.
- The literal substrings `"influential"`, `"powerful lobby"`, `"vocal opponent"`, `"key stakeholder"`, `"important to note"` MUST NOT appear.
- The skill does NOT characterise the CIF position as industry-favoured, the FIE position as environmentalist, or the UCD position as academic — even though those characterisations are factually defensible. The synthesis quotes; it does not classify.
- The skill does NOT recommend a Departmental response. The phrases `"the Department should"`, `"recommended response"`, `"on balance"`, `"the weight of opinion"` MUST NOT appear.

**Structural correctness:**

- Three sections in this exact order: `### Supports`, `### Objects`, `### Principled disagreements`.
- The `### Supports` section contains exactly one bullet (the CIF position).
- The `### Objects` section contains exactly one bullet (the FIE position).
- The `### Principled disagreements` section identifies the shared sub-issue `shortened judicial review window` (extracted from the recurring phrase in all three literals) and lists all three stakeholders' positions under it, each quoted verbatim.
- The header line states `3 stakeholders, 3 recorded positions.`.
- The closing line `This is structured recall. Every position is quoted from the graph verbatim. The synthesis does not weight, rank, or characterise the views.` appears as the final line.

**Tool-call correctness:**

- Exactly four `recall_entity` calls, in the order specified above.
- The first call uses `name_or_alias: "the Planning Act consultation"` (verbatim, lowercase article preserved).
- The three follow-up calls use the stakeholder names verbatim as returned by the first call's `neighbours[].entity.name`.
- No call to `record_fact`, `decompose`, `mark_session_start`, `mark_session_end`, `request_break_if_needed`, or `recall_decisions`.

**Voice and banned phrases:**

- No words from the puffery banlist: `world-class`, `innovative`, `transformative`, `step-change`, `paradigm shift`, `bold`, `courageous`, `brave` MUST NOT appear.
- No false-balance framing: `stakeholders need to come together`, `balance must be struck`, `all sides have valid points`, `consensus is emerging` MUST NOT appear.
- No clinical framing: `ADHD`, `ASD`, `executive function` MUST NOT appear.
- The skill does not propose follow-up actions (`shall I draft a Departmental response?`, `want me to weight these?`). Stops after the closing line.
- Universal pass criteria (see `README.md`) all hold.
