---
name: audit-prompt-schema-drift
description: Verify that mcp-translation prompts reference field names that match the schemas. Catches the class of bug where a prompt asks for `confidence` but the schema requires `certainty`.
---

# audit-prompt-schema-drift

A static check across `packages/mcp-translation/src/neurodock_mcp_translation/prompts/*.prompt.md`
and `packages/mcp-translation/schemas/*.schema.json` to confirm every
field the prompt asks the model to produce is a field the schema accepts.

This is the highest-value pre-flight check for the translation server:
when a prompt drifts from the schema, the LLM produces a structurally
invalid response and the server rejects it — but the failure mode looks
like "model is bad" rather than "prompt is out of sync".

## When to use

- Before merging any PR that touches a `*.prompt.md` or `*.schema.json`
  in `packages/mcp-translation/`.
- Before cutting a release of `neurodock-mcp-translation`.
- When the eval corpus shows a sudden drop in pass rate with no model
  change.

## What it does

For each prompt file under `packages/mcp-translation/src/neurodock_mcp_translation/prompts/`:

1. Identifies the schema it corresponds to by filename
   (`translate_incoming.prompt.md` ↔ `translate_incoming.schema.json`).
2. Extracts the field names the prompt asks the model to produce
   (typically inside the prompt's JSON skeleton or its bullet list of
   keys).
3. Extracts the field names the schema's `output.properties` declares.
4. Diffs the two sets:
   - **Prompt asks for a field the schema does not accept** → drift; the
     model output will be rejected.
   - **Schema requires a field the prompt does not ask for** → drift; the
     model will omit it and trigger a `required` validation error.
5. Prints a per-prompt report.

## How to invoke

There is no scripted runner yet. The check is a structured grep + diff.
Suggested invocation pattern:

```bash
for prompt in packages/mcp-translation/src/neurodock_mcp_translation/prompts/*.prompt.md; do
  tool=$(basename "$prompt" .prompt.md)
  schema="packages/mcp-translation/schemas/${tool}.schema.json"
  echo "## $tool"
  jq -r '.properties.output.properties | keys[]' "$schema" | sort > /tmp/schema-keys
  grep -oE '"[a-z_]+"' "$prompt" | tr -d '"' | sort -u > /tmp/prompt-keys
  diff /tmp/schema-keys /tmp/prompt-keys
done
```

Replace with a real script under `scripts/audit-prompt-schema-drift.sh`
when written; the contract above is what it should implement.

## Output format

Per prompt, one of:

```
## translate_incoming
ok — 6 fields match
```

or:

```
## translate_incoming
DRIFT
  prompt asks for: confidence_score
  schema declares: confidence
  prompt asks for: implicit_meaning
  schema declares: likely_subtext
```

Exit non-zero on any drift.

## Limitations

- Heuristic. The extractor for "fields the prompt asks for" is a regex
  over double-quoted lowercase-snake tokens. False positives happen when
  the prompt embeds a string literal that is not a field name; false
  negatives happen when the prompt names a field in prose without quotes.
- Nested object fields (`ambiguity.spans[].reason`) are not deep-compared
  — only the top-level keys are diffed. Nested drift still needs eyes.
- The check only covers mcp-translation. Other servers do not author
  prompts in markdown; their tool handlers are pure Python and a type
  checker catches the equivalent class of bug.

## When to ship a prompt change

Per plan.md §7, every prompt change runs against the eval corpus at
`packages/evals/corpora/translation/incoming/v0.1.0/general.jsonl`. Run
this audit first to catch the cheap bugs, then run the evals.

## Voice

Lead with the drifted field name and the schema's actual field name on
adjacent lines. The contributor will fix the prompt by reading those two
lines; do not bury the diff under prose.
