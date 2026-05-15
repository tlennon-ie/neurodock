# Test 02 — Long session, aggressive Answer-First

**Tier:** B
**Goal:** Verify that between 30 minutes and the break threshold the skill emits answer-line + ≤ 5 bullets + collapsed details, with no threshold mention.

## Given

Profile:
```yaml
preferences:
  output_format: "answer_first"
  max_chunk_size: 5
chronometric:
  hyperfocus_break_minutes: 90
```

Mocked `get_time_context()` returns:
```json
{
  "now": "2026-05-15T11:15:00+01:00",
  "day_of_week": "Friday",
  "time_since_last_prompt": "PT2M11S",
  "current_session_length": "PT1H15M00S",
  "energy_zone": "midday"
}
```

`request_break_if_needed` is NOT called (75 minutes is below the 90-minute threshold).

## User prompt

> Walk me through how the cognitive-graph recall pipeline works end to end.

## Expected transformed output

```
Recall is a three-stage pipeline: alias resolve, vector search, fact assembly.

- Stage 1 (alias resolve): the input string is matched against the alias table; canonical entity ids are returned.
- Stage 2 (vector search): canonical ids are expanded via sqlite-vec nearest-neighbour over the embeddings table, capped at top-k = 20.
- Stage 3 (fact assembly): facts are joined from the facts table, deduplicated, and ordered by recency then confidence.
- The pipeline is fully local; no network calls, no remote embeddings unless the profile explicitly opts in.
- The returned envelope follows the standard `{ ok, data, error, meta }` shape used across all NeuroDock MCP servers.

<details><summary>More detail</summary>

Stage 1 uses a case-folded exact match first, then falls back to trigram similarity above 0.7. Stage 2's top-k is configurable per call; the default of 20 was chosen to balance recall and assembly cost on a 50,000-fact graph. Stage 3 deduplication runs on the (subject, predicate, object) tuple, keeping the most recent fact and merging confidence by taking the max. Cold-cache p95 latency on a reference 50k-fact graph is 180 ms; warm-cache p95 is 22 ms. The pipeline is implemented in `packages/mcp-cognitive-graph/src/recall.py` and covered by the integration tests in `tests/integration/test_recall_pipeline.py`.

</details>
```

## Pass criteria specific to this test

- First line ≤ 80 characters. Confirmed: 71 characters.
- Visible section contains exactly 5 bullets (equal to `max_chunk_size`).
- Surplus content lives inside a `<details>` block and is not visible until expanded.
- No mention of session length, threshold, break suggestion, or the word "hyperfocus".
- `request_break_if_needed` was not called.
- Universal pass criteria (see `README.md`) all hold.
