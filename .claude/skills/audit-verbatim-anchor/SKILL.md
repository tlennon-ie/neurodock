---
name: audit-verbatim-anchor
description: For any change to mcp-translation or its eval corpus, verify every fixture satisfies ambiguous_items[].quoted_span.text == transcript[start_char:end_char]. The schema invariant from ADR 0005.
---

# audit-verbatim-anchor

A static check that walks every JSON fixture under
`packages/evals/corpora/translation/` and confirms each ambiguous span's
quoted text equals the substring `transcript[start_char:end_char]`. This
is the schema invariant ADR 0005 calls "anti-hallucination armour" for
meeting briefs; if a fixture drifts, the server's runtime
`VERBATIM_ANCHOR_FAILED` check will reject it, but evals will fail
opaquely. Catch it before it ships.

Authoritative references:

- ADR 0005: `docs/decisions/0005-translation-tool-design.md` (see
  "Verbatim quoting for clinical safety" and the
  `VERBATIM_ANCHOR_FAILED` rule).
- Schema: `packages/mcp-translation/schemas/brief_meeting.schema.json`
  (`AmbiguousItem.verbatim` const `true`, `quoted_span` required).
- Same shape reused by `translate_incoming.ambiguity.spans` and
  `check_tone.flagged_phrases`.

## When to use

- Before merging any PR that touches `packages/mcp-translation/` source,
  schemas, or prompts.
- Before merging any PR that adds or edits a fixture under
  `packages/evals/corpora/translation/`.
- Before cutting a release of `neurodock-mcp-translation` or
  `neurodock-evals`.

## What it does

For every JSON / JSONL fixture under
`packages/evals/corpora/translation/`:

1. Loads the fixture.
2. Locates the `transcript` (or `text`) field that is the verbatim
   source.
3. Walks every nested item with a `quoted_span` object — typically
   `ambiguous_items[]`, `ambiguity.spans[]`, `flagged_phrases[]`.
4. For each span, asserts:

   ```
   fixture.transcript[span.start_char : span.end_char]  ==  span.text
   ```

5. Reports every mismatch with file, JSON path, expected substring, and
   actual `span.text`.

## How to invoke

There is no scripted runner yet. Reference implementation in Python:

```python
import json, pathlib, sys
failures = []
for path in pathlib.Path("packages/evals/corpora/translation").rglob("*.jsonl"):
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip(): continue
        f = json.loads(line)
        transcript = f.get("transcript") or f.get("text") or ""
        for item in (f.get("ambiguous_items") or []):
            span = item.get("quoted_span") or {}
            expected = transcript[span.get("start_char", 0):span.get("end_char", 0)]
            if expected != span.get("text", ""):
                failures.append((path, lineno, span, expected, span.get("text", "")))
for p, n, s, e, a in failures:
    print(f"{p}:{n}: span {s['start_char']}..{s['end_char']}\n  expected: {e!r}\n  actual:   {a!r}")
sys.exit(1 if failures else 0)
```

The check belongs at `scripts/audit-verbatim-anchor.py` once written.

## Output format

Clean run:

```
packages/evals/corpora/translation/incoming/v0.1.0/general.jsonl: 84 spans checked, all anchored
```

Drift:

```
packages/evals/corpora/translation/brief/v0.1.0/director.jsonl:12: span 142..168
  expected: 'can we revisit the rollout'
  actual:   'can we revisit the timeline'
```

Exit non-zero on any drift.

## The invariant in code

The server enforces this at runtime:

```python
if transcript[span.start_char:span.end_char] != span.text:
    raise VerbatimAnchorFailed(...)
```

This skill is the offline equivalent: confirm fixtures pass the same
check before they reach the evals.

## Limitations

- Fixture shapes vary across the three tools that use spans. The walker
  above handles `ambiguous_items` and the top-level `ambiguity.spans`
  case; extend it for `check_tone.flagged_phrases` when those fixtures
  land.
- The check is byte-offset based, like the schema. Multi-byte characters
  (emoji, accented letters) are valid; the offsets are character
  offsets, not byte offsets — Python slicing respects that, so the check
  works.
- If a fixture intentionally has no `quoted_span` (e.g. a negative
  fixture for `VERBATIM_ANCHOR_FAILED`), the walker skips it. Mark
  intentional negatives clearly in the fixture comment.

## Voice

When a span fails, show the expected and actual substrings on adjacent
lines so the human reviewer can spot the drift in one glance. Do not
explain why verbatim anchoring matters every time the script runs — link
to ADR 0005 once and move on.
