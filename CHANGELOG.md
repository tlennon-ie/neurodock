# Changelog

This is the **index** of release history. Each package has its own
`CHANGELOG.md` next to its source. Conventional Commits + Changesets drive
the per-package files; this index just points at them and summarises
repo-wide milestones.

## Repo-wide releases

### v0.2.1 — 2026-05-20 (developer preview)

Three substrate pillars built, on `main`, installable from npm + PyPI.

- All six MCP servers published to PyPI.
- CLI shipped with `init`, `doctor`, `validate`, `update`, `uninstall`,
  `host install/uninstall`, `profile show/validate`.
- Guardrail v0.0.2 — all three detectors live (rumination, hyperfocus,
  sycophancy).
- Task-fractionator v0.0.2 — ISO 8601 duration parsing clarified.
- Cognitive-graph v0.0.2 — 4-rung resolution cascade
  (exact → alias → fuzzy → embedding).
- Native-host v0.1.0 — optional Chrome Native Messaging bridge.

### v0.2.0 — 2026-05-19

- Six MCP servers initial publish.
- Five launch skills.

### v0.1.0 — 2026-05-18

- Repo bootstrap, monorepo tooling, Astro Starlight docs site.

## Per-package changelogs

### TypeScript packages (npm)

- [`@neurodock/cli`](./packages/cli/CHANGELOG.md)
- [`@neurodock/core`](./packages/core/CHANGELOG.md)
- [`@neurodock/native-host`](./packages/native-host/CHANGELOG.md)
- [`@neurodock/extension-browser`](./packages/extension-browser/CHANGELOG.md)

### Python packages (PyPI)

- [`neurodock-mcp-chronometric`](./packages/mcp-chronometric/CHANGELOG.md)
- [`neurodock-mcp-cognitive-graph`](./packages/mcp-cognitive-graph/CHANGELOG.md)
- [`neurodock-mcp-task-fractionator`](./packages/mcp-task-fractionator/CHANGELOG.md)
- [`neurodock-mcp-translation`](./packages/mcp-translation/CHANGELOG.md)
- [`neurodock-mcp-guardrail`](./packages/mcp-guardrail/CHANGELOG.md)
- [`neurodock-clinical`](./packages/clinical/CHANGELOG.md)
- [`neurodock-evals`](./packages/evals/CHANGELOG.md)

## How releases work

1. PRs land with a Changesets entry under `.changeset/` describing
   user-facing changes.
2. A maintainer cuts a release by merging the Changesets "Version
   packages" PR, which bumps package versions and assembles the
   per-package CHANGELOG entries.
3. Tagging triggers `.github/workflows/release.yml` which publishes
   npm + PyPI in parallel.
4. This index is updated by hand for repo-wide milestones — not every
   single package bump warrants an entry here.

See `CONTRIBUTING.md` for the changeset workflow.
