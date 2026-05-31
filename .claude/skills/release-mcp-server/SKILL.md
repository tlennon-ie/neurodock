---
name: release-mcp-server
description: Walk through cutting a PyPI release of one of the five MCP servers — bump version, write CHANGELOG, run tests and evals, tag, publish.
---

# release-mcp-server

A checklist for releasing any of the five Python MCP servers published to
PyPI:

- `packages/mcp-chronometric/` to `neurodock-mcp-chronometric`
- `packages/mcp-cognitive-graph/` to `neurodock-mcp-cognitive-graph`
- `packages/mcp-guardrail/` to `neurodock-mcp-guardrail`
- `packages/mcp-task-fractionator/` to `neurodock-mcp-task-fractionator`
- `packages/mcp-translation/` to `neurodock-mcp-translation`

Releases are CI-driven. You bump versions in a PR, merge it, then push a
single `v*` tag. The Release workflow does the publishing. The contributor
reading this should already have decided the version bump via the
`version-impact` skill.

## When to use

- After a PR has been merged that warrants a release of one or more of the
  servers above.
- When `version-impact` flagged `needs-bump` against a server and you are
  picking the release up.

## Prerequisites

- The bump kind decision (`major` / `minor` / `patch`) for each affected
  server, run `version-impact` first if unsure.
- Push access to `main` and permission to push tags. No PyPI or registry
  token is needed locally, CI holds those.
- `uv` available for running tests and evals before you cut the release.

## How releases work

The whole release is triggered by pushing one `v*` tag (for example
`v0.7.3`). That tag fires the Release workflow in
`.github/workflows/release.yml`, which runs three jobs:

1. `npm` publishes the changed TypeScript packages with `pnpm -r publish`.
2. `pypi` builds and publishes every Python package with `uv build` and
   `uv publish`, one package at a time.
3. `mcp-registry` runs after `pypi` and publishes every
   `packages/*/server.json` to `registry.modelcontextprotocol.io` using
   GitHub OIDC. It first rewrites each `server.json` version to match that
   package's `pyproject.toml`, so the manifest and the package stay in
   lockstep.

You do not run `uv publish` or touch the registry by hand. Your job is to
land the version bump in a PR and push the tag.

## What it does

Walks through the release steps in order. The skill does not execute them,
it lists them so nothing is skipped.

### 1. Bump the version (in a PR)

For each affected server, edit `packages/mcp-<server>/pyproject.toml` and
update the `version` field. Follow semver, the bump kind was decided by
`version-impact`.

A version bump is required even for a docs-only or README change you want
the registry to pick up. The registry verifies PyPI ownership via the
`mcp-name:` marker in the _published_ PyPI README, and that README only goes
live when a new version is published. Without a bump, the marker never
updates.

### 2. Update the server manifest

The `mcp-registry` job syncs `packages/mcp-<server>/server.json` to the
`pyproject.toml` version automatically at publish time, so you do not have
to hand-edit the version number. Do update any other fields in
`server.json` that the release changes (new tool descriptions, changed
runtime arguments, and similar).

### 3. Update the local CHANGELOG

Append a `## [<new-version>] - YYYY-MM-DD` heading to
`packages/mcp-<server>/CHANGELOG.md` (Keep a Changelog style, matching the
existing entries), then `### Added / Changed / Fixed` sub-sections with
one-line bullets. Plain, factual, ND-readable.

### 4. Run tests

```bash
uv run --directory packages/mcp-<server> pytest
```

Must exit 0. Coverage gate per `pytest.ini` for the server.

### 5. Run evals (if the server has them)

mcp-translation has evals in `packages/evals/corpora/translation/`. Any
prompt change ships through the eval pipeline (plan.md §7):

```bash
uv run --directory packages/evals pytest -k translation
```

Other servers have no eval corpus today, skip this step.

### 6. Open the PR and merge it

Open a PR with the version bumps, the `server.json` edits, and the CHANGELOG
entries. Get it reviewed and merged into `main`. Nothing publishes from the
PR itself, the publish happens on the tag.

### 7. Tag the release and let CI publish

From an up-to-date `main`:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

A single repo-wide `v*` tag triggers the Release workflow. The `pypi` job
publishes every package whose version is not yet on PyPI, then the
`mcp-registry` job publishes every `server.json`. Both jobs skip versions
that already exist, so an unchanged package is a clean no-op.

Confirm the run in the Actions tab, then check
`https://pypi.org/project/neurodock-mcp-<server>/<new-version>/` and the
server's listing on the MCP registry.

## Post-release

- Update any `pyproject.toml` in other packages that pinned the released
  server.
- If the release added a tool or changed a schema, regenerate any
  downstream client bindings.
- Note the version in the root `CHANGELOG.md` under the next repo-wide
  release entry (batched, not per-PR, see version-impact skill).

## Limitations

- Publishing is CI-driven and version-gated. If you forget to bump a
  version, the `pypi` and `mcp-registry` jobs skip that package and nothing
  ships, no error tells you the bump was missing.
- The registry publish depends on the PyPI publish, the `mcp-registry` job
  needs `pypi` because ownership is verified via the `mcp-name:` marker in
  the published PyPI README (ADR 0008 / 0009).
- Yanking a bad release requires manual PyPI dashboard action, the skill
  does not cover rollback.
- Releases are cut from a `v*` tag on `main`. Tagging from a branch is
  possible but not documented here.

## Voice

A release is a procedure. List the steps, say what to verify between them,
and stop. Resist the urge to write release-note copy in this checklist, that
belongs in the CHANGELOG itself.
