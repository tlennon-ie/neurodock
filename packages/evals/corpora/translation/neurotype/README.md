# translation/neurotype slice

Per-neurotype eval slice (R6). A **cross-cutting** slice: every example here
carries a `neurotypes` tag (the canonical profile enum from
`packages/core/schemas/profile.schema.json`) declaring which neurotype
slice(s) it belongs to. The harness aggregates a score per neurotype — in
addition to the existing per-tool `SliceScore` rows — so a `mcp-translation`
prompt change can be measured against, e.g., the `dyslexia` slice.

| Field       | Value                                                  |
| ----------- | ------------------------------------------------------ |
| Slice       | `translation/neurotype`                                |
| Bound tool  | `translate_incoming` (richest deterministic baseline)  |
| Tag enum    | `adhd asd audhd ocd dyslexia dyspraxia tourette other` |
| Aggregation | `neurodock_evals.scoring.neurotype_scores`             |

## Why a separate slice rather than tagging the existing tool slices

The four tool slices (`incoming`, `tone`, `outgoing`, `meetings`) version on a
fixed per-tool example count asserted by `tests/test_corpus_load.py`. The
neurotype dimension is orthogonal to the tool, so it lives in its own slice to
keep the per-tool counts stable. The `neurotypes` tag itself is generic — any
future example in any slice MAY carry it, and the aggregator picks it up.

## Provenance

Every example is **synthesised** by the curator to demonstrate the format and
exercise the per-neurotype machinery end-to-end. These are NOT real messages.
They run through the same consent + anonymisation conventions as the other
seed slices (`status: synthesised`, `consent.anonymisation_pass: 1`,
`sha256:`-prefixed synthesised consent token, pseudonymous contributor id).

## Coverage (v0.0.3)

Two examples each for the seven neurotypes that have extension addendum
blocks: `adhd`, `asd`, `audhd`, `ocd`, `dyslexia`, `dyspraxia`, `tourette`.
`other` is reserved for contributed examples that self-describe a neurotype
outside the enum.

## Thresholds stay permissive

These slices are reported on every `mcp-translation` prompt PR but the gate
threshold is intentionally permissive (the package default, 0.6). Per-type
threshold tuning follows the first real contributed corpora; R6 ships the
measurement, not a hard per-type gate.
