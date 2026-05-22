---
name: version-impact
description: Assess a diff for version-bump implications, missing CHANGELOG entries, and stale docs. Run before opening a PR.
---

# version-impact

Pre-flight check for any PR that might touch a published package. It does
not call out to any service; it just runs `git`, `cat`, `grep`, and `jq`
against the local checkout and reports what it sees.

The CI workflow `.github/workflows/pr-version-check.yml` runs the same
deterministic logic via `.github/scripts/version-impact.sh` and posts a
sticky comment on the PR. Running this skill locally is a faster preview
of that same comment.

## When to run

- Before opening a PR
- Before pushing a new commit to a PR that touches `packages/`
- Whenever the CI sticky comment flags something you want to validate
  locally

## What it does

1. Reads `git diff <base>...HEAD --name-only` (default base: `origin/main`).
2. Maps each changed file to its owning package using the layout below.
3. For each affected publish-path package:
   a. Classifies the touched files into a change-kind bucket
   (`major` / `minor` / `patch` / `none`).
   b. Reads the current `version` from `package.json` or `pyproject.toml`.
   c. Diffs that version against the file at `<base>` to see if it was
   already bumped, and whether the bump matches the recommended kind.
   d. Checks whether the package's local `CHANGELOG.md` got a new entry
   for the new version.
   e. Greps the root `CHANGELOG.md` and `docs/` for hardcoded references
   to the old version that may now be stale.
4. Emits a markdown report (see "Output format" below).

## How to invoke

From the repo root:

```bash
bash .github/scripts/version-impact.sh
```

To diff against a different base:

```bash
BASE_REF=origin/release-0.3 bash .github/scripts/version-impact.sh
```

To get JSON instead of markdown (useful for piping into other tooling):

```bash
FORMAT=json bash .github/scripts/version-impact.sh
```

## File-to-package mapping

This is the authoritative mapping the skill and the workflow share. If
the workspace layout changes, both this section and the matching
`case` in `.github/scripts/version-impact.sh` must be updated.

| Path glob                                 | Package                                                     | Publish target                                   |
| ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `packages/cli/**`                         | `@neurodock/cli`                                            | npm                                              |
| `packages/core/**`                        | `@neurodock/core`                                           | npm                                              |
| `packages/native-host/**`                 | `@neurodock/native-host`                                    | npm                                              |
| `packages/extension-browser/**`           | `@neurodock/extension-browser`                              | private (bumps still flagged)                    |
| `packages/mcp-chronometric/**`            | `neurodock-mcp-chronometric`                                | PyPI                                             |
| `packages/mcp-cognitive-graph/**`         | `neurodock-mcp-cognitive-graph`                             | PyPI                                             |
| `packages/mcp-guardrail/**`               | `neurodock-mcp-guardrail`                                   | PyPI                                             |
| `packages/mcp-task-fractionator/**`       | `neurodock-mcp-task-fractionator`                           | PyPI                                             |
| `packages/mcp-translation/**`             | `neurodock-mcp-translation`                                 | PyPI                                             |
| `packages/clinical/**`                    | `neurodock-clinical`                                        | PyPI                                             |
| `packages/evals/**`                       | `neurodock-evals`                                           | PyPI                                             |
| `packages/skills/*/**`                    | skill bundle (no semver; flag SKILL.md frontmatter changes) | n/a                                              |
| `plugins/*/**`                            | community plugin (version lives in the plugin)              | n/a                                              |
| `profiles/*`                              | profile preset                                              | n/a                                              |
| `docs/**`                                 | documentation site                                          | n/a (but flagged if referencing a stale version) |
| `.github/**`, root markdown, `scripts/**` | meta                                                        | n/a                                              |

## Heuristics for bump kind

Per-package, look at what was touched inside the package directory:

- **major**
  - A schema file under `schemas/` lost a field or renamed a required field
  - A CLI subcommand was removed (file deletion under `packages/cli/src/commands/`)
  - An MCP tool was removed (deleted handler under `src/tools/` or
    `src/server.py`-level registration removed)
  - A required parameter was added to an existing tool/CLI schema
- **minor**
  - A new CLI subcommand was added
  - A new MCP tool was added
  - A new field was added to a published schema
  - A new optional argument was added to an existing tool
- **patch**
  - Bug-fix-only changes to existing files in `src/`
  - Internal refactors that leave the public surface unchanged
  - Performance tweaks
  - README / CHANGELOG rewrites inside the package
- **none**
  - Test-only changes (`tests/**`, `*.test.ts`, `*.spec.ts`, `test_*.py`)
  - Doc-only changes (the package's own `README.md`, `CHANGELOG.md` of
    older entries)
  - Tooling-only (`tsconfig*.json`, `pytest.ini`, `vitest.config.ts`)

The detection is conservative — when in doubt the skill picks the higher
bump kind and explains why in the report so the contributor can override
it if the heuristic was too cautious.

## Cross-reference checks

After identifying touched packages, the skill greps for:

- Any `docs/**/*.md*` file that mentions the package's **old** version
  string (`v0.4.2`, `0.4.2`) — flagged as potentially stale.
- The root `CHANGELOG.md` — if a publish-path package's version changed
  in this PR but the root index has no entry for the new repo-wide
  release, that gets flagged too (only an info-level note; root-index
  entries are batched and not required per-PR).
- The package's local `CHANGELOG.md` — if the version bumped but no new
  entry exists for that version, that's a hard "missing CHANGELOG" flag.
- `.changeset/*.md` — if no changeset file exists and a publish-path
  package's source changed, the skill suggests running `pnpm changeset`.

## Output format

The skill prints a markdown report with these sections, in order:

### `## Touched packages`

A table. Columns: package | files changed | recommended bump | current
version | suggested new version | status.

Status is one of:

- `ok` — version bumped, CHANGELOG present
- `needs-bump` — source changed, version unchanged
- `bump-mismatch` — version bumped but smaller than recommended
- `missing-changelog` — version bumped but no CHANGELOG entry
- `no-changeset` — no `.changeset/*.md` for a publish-path change

### `## CHANGELOG check`

Per-package one-line entries:

- `✓ packages/cli/CHANGELOG.md — entry for v0.4.4`
- `✗ packages/mcp-cognitive-graph/CHANGELOG.md — needed for v0.0.4`

### `## Docs cross-references that may be stale`

Each line: `<file>:<line> — references "v0.4.2" — should be "v0.4.3"?`
If no stale references found, prints `(none)`.

### `## Suggested next steps`

A numbered checklist the contributor can paste into the PR or follow
locally. Examples:

- `[ ] Bump @neurodock/cli from 0.4.3 to 0.4.4 in packages/cli/package.json`
- `[ ] Add a CHANGELOG entry under packages/cli/CHANGELOG.md`
- `[ ] Run pnpm changeset and commit the new file under .changeset/`

## Limitations

- Heuristics are pattern-based, not semantic. A file move that looks
  like a deletion will be flagged as "major" even when it's a no-op
  refactor. The report is advisory.
- Stale-version greps match string-by-string. A docs page that says
  "starting in v0.4.0" is intentional and does NOT need updating
  when the package moves to v0.5.0 — review each flagged line.
- The skill does NOT modify any file. It only reads.

## Voice

Keep it factual. No marketing copy, no enthusiasm markers. The output
goes into a PR comment that contributors read while they're already
tired; lead with what's wrong, not what's right.
