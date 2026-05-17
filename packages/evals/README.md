# neurodock-evals

The versioned eval corpora and the air-gapped harness that runs ND prompts
against them.

The corpus is the strategic asset that makes the translation layer honest. We
prove that ND-aware prompts help neurodivergent users in real situations, and
we catch regressions when prompts change. The harness gates prompt PRs in CI.

This package is **v0.0.1** — the scaffold, the harness, and 6-10 hand-authored
seed examples. The seeds are **synthesised by the eval-curator agent to
demonstrate the format** — they are NOT real corporate messages. Real
contributed corpora arrive over Phase 2 (target ~300 examples by month 6, per
`plan.md` §7).

## What's here

```
packages/evals/
├── src/neurodock_evals/        # Harness, anonymiser, deduper, scorer
├── corpora/                    # Versioned YAML eval examples by slice
├── schemas/                    # JSON Schemas for examples + annotations
└── tests/                      # Tests for the harness itself
```

## Quick start

Run the harness against the seed corpora:

```bash
uv run python -m neurodock_evals.harness --corpus translation/incoming \
    --tool translate_incoming
```

Run all four translation slices:

```bash
uv run python -m neurodock_evals.harness --ci
```

Anonymise a contribution before opening a PR:

```bash
uv run python -m neurodock_evals.anonymise path/to/example.yaml
```

## Air-gapped by design

The harness never calls an LLM. It exercises each tool's **deterministic
baseline** (the heuristic layer the translation server returns even before any
LLM refinement) and scores the baseline against the human-rated `expected`
block. Any LLM-side eval is a separate concern that the council reviews
under a different policy.

## Privacy

- The harness never logs example contents to stdout or to anywhere outside
  `.eval-reports/`.
- Reports contain example IDs and scores only — never verbatim text.
- The contribution pipeline (`anonymise.py`) is a safety net, NOT a substitute
  for contributor judgement. See `CONTRIBUTING.md`.
- All corpora are licensed **AGPL-3.0-or-later**.

## Glossary

| Term | Meaning |
| ---- | ------- |
| corpus slice | a directory under `corpora/<server>/<slice>/`; the unit of versioning |
| example | one YAML file under a slice — one input, one `expected` block, multiple ratings |
| rating | one ND-rater's judgement of how close the `expected` block matches their read |
| deterministic baseline | the heuristic output a translation tool returns without invoking an LLM |
| eval-corpus binding | every `mcp-translation` tool cites the slice that validates it (ADR 0005 §4) |

## Status

- v0.0.1 (current): scaffold + harness + 10 synthesised seed examples
- v0.0.2 (planned): first contributed corpus (after Phase 2 outreach)
- v0.1.0 (planned): HuggingFace publication pipeline under the `neurodock` org

See `CHANGELOG.md` for detail.
