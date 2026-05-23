---
name: release-mcp-server
description: Walk through cutting a PyPI release of one of the five MCP servers — bump version, write CHANGELOG, run tests and evals, tag, publish.
---

# release-mcp-server

A checklist for releasing any of the five Python MCP servers published to
PyPI:

- `packages/mcp-chronometric/` → `neurodock-mcp-chronometric`
- `packages/mcp-cognitive-graph/` → `neurodock-mcp-cognitive-graph`
- `packages/mcp-guardrail/` → `neurodock-mcp-guardrail`
- `packages/mcp-task-fractionator/` → `neurodock-mcp-task-fractionator`
- `packages/mcp-translation/` → `neurodock-mcp-translation`

The contributor reading this should already have decided the version bump
via the `version-impact` skill.

## When to use

- After a PR has been merged that warrants a release of one of the
  servers above.
- When `version-impact` flagged `needs-bump` against a server and you
  are picking the release up.

## Prerequisites

- The bump kind decision (`major` / `minor` / `patch`) — run
  `version-impact` first if unsure.
- PyPI API token configured locally (kept out of the repo).
- `uv` available (the project uses `uv` for Python tooling).

## What it does

Walks through the seven release steps in order. The skill does not
execute them — it lists them so nothing is skipped.

### 1. Bump the version

Edit `packages/mcp-<server>/pyproject.toml` and update the `version`
field. Follow semver; the bump kind was decided by `version-impact`.

### 2. Update the local CHANGELOG

Append a `## <new-version> — YYYY-MM-DD` heading to
`packages/mcp-<server>/CHANGELOG.md`, then `### Added / Changed / Fixed`
sub-sections with one-line bullets. Plain, factual, ND-readable.

### 3. Run tests

```bash
uv run --directory packages/mcp-<server> pytest
```

Must exit 0. Coverage gate per `pytest.ini` for the server.

### 4. Run evals (if the server has them)

mcp-translation has evals in `packages/evals/corpora/translation/`. Any
prompt change ships through the eval pipeline (plan.md §7):

```bash
uv run --directory packages/evals pytest -k translation
```

Other servers have no eval corpus today — skip this step.

### 5. Build the wheel

```bash
uv build --directory packages/mcp-<server>
```

Artefacts land in `packages/mcp-<server>/dist/`.

### 6. Tag the release

```bash
git tag mcp-<server>/<new-version>
git push origin mcp-<server>/<new-version>
```

The per-package tag prefix prevents collisions with other packages
releasing on the same day.

### 7. Publish to PyPI

```bash
uv publish --directory packages/mcp-<server> --token "$PYPI_TOKEN"
```

Confirm at `https://pypi.org/project/neurodock-mcp-<server>/<new-version>/`.

## Post-release

- Update any `pyproject.toml` in other packages that pinned the released
  server.
- If the release added a tool or changed a schema, regenerate any
  downstream client bindings.
- Note the version in the root `CHANGELOG.md` under the next repo-wide
  release entry (batched, not per-PR — see version-impact skill).

## Limitations

- No CI-driven release pipeline today. The PyPI push is manual; do not
  forget step 7 after tagging.
- Yanking a bad release requires `uv` + manual PyPI dashboard action; the
  skill does not cover rollback.
- The skill assumes a clean working tree on `main`. Releasing from a
  branch is possible but not documented here.

## Voice

A release is a procedure. List the steps, say what to verify between
them, and stop. Resist the urge to write release-note copy in this
checklist — that belongs in the CHANGELOG itself.
