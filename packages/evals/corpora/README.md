# Eval corpora

Versioned datasets that anchor the prompt regression suite. Every directory
under here is **one slice**: one server, one tool-family, one set of
hand-rated examples.

## Layout

```
corpora/
├── translation/        # Slices for the mcp-translation server
│   ├── incoming/       # translate_incoming evaluator
│   ├── tone/           # check_tone evaluator
│   ├── outgoing/       # rewrite_outgoing evaluator
│   └── meetings/       # brief_meeting evaluator
└── guardrail/          # Reserved for the
```

## File format

One YAML file per example, named `NNN-slug.example.yaml`. Validated against
`packages/evals/schemas/example.schema.json`. See `CONTRIBUTING.md` for the
contribution flow.

## Provenance

Every example in v0.0.1 is **synthesised** by to
demonstrate the format and exercise the harness end-to-end. These are NOT
real corporate messages. Phase 2 brings the first contributed examples
through the consent pipeline at `evals.neurodock.org/contribute`.
