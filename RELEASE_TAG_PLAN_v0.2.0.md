# Release tag plan — v0.2.0

**Owner:** Council member cutting the release.
**Pre-req:** `RELEASE_CHECKLIST_v0.2.0.md` complete; all gates green.

This document captures the exact commands. Do **not** execute until the
checklist passes.

---

## 0. Sanity

```bash
git fetch origin
git checkout main
git pull --ff-only
git status                       # must be clean
git log --oneline -5             # confirm you are on the expected commit
```

---

## 1. Consume the changesets (TS-side)

Changesets only tracks the three TS packages registered in
`pnpm-workspace.yaml`: `@neurodock/core`, `@neurodock/cli`,
`@neurodock/extension-browser`. The six changeset files target either
`@neurodock/core` (bookkeeping for Python / skill releases) or
`@neurodock/extension-browser` (real bump).

```bash
pnpm changeset version           # consumes .changeset/*.md, bumps the TS pkgs, regenerates TS CHANGELOGs
pnpm install --no-frozen-lockfile  # refresh lockfile after the bump
git diff                           # review version bumps and CHANGELOG diffs
```

Expected:

- `@neurodock/extension-browser` → `0.0.1`.
- `@neurodock/core` → patch bump from whatever its current version is (bookkeeping).
- `@neurodock/cli` → untouched (no changeset references it).

Commit the version bump on `main` via a normal PR (the council still merges
through review — no direct push to `main`).

---

## 2. Bump the Python packages and the skill manually

Python packages are not in the Changesets registry. The council updates these
by hand in the same PR as step 1 (or a follow-up PR — both are acceptable):

```bash
# Edit each pyproject.toml — bump version = "0.0.0" or current → "0.0.1"
packages/mcp-translation/pyproject.toml
packages/mcp-guardrail/pyproject.toml
packages/evals/pyproject.toml

# Skill version lives in SKILL.md frontmatter
packages/skills/asd-meeting-translator/SKILL.md      # bump to version: 0.1.0
```

Run `uv lock` after the pyproject edits.

---

## 3. Dry-run publish (mandatory)

```bash
# TS — dry-run via pnpm
pnpm --filter @neurodock/extension-browser publish --dry-run --no-git-checks

# Python — uv supports --check-url or you can build and inspect the dist
for pkg in packages/mcp-translation packages/mcp-guardrail packages/evals; do
  (cd "$pkg" && uv build)
  ls "$pkg/dist/"
done
```

Inspect the resulting tarballs. Verify `pyproject.toml` `version` is the
expected `0.0.1` in every dist. Stop here if any artefact looks wrong —
unwind the version commits and re-run.

---

## 4. Tag the commits

Tag the merge commit that contains the consumed changesets and the Python /
skill bumps. **Tag from the same commit so `release.yml` sees a single
coordinated release point.**

```bash
git tag mcp-translation@0.0.1 -m "neurodock-mcp-translation 0.0.1 — four-tool translation server (ADR 0005)"
git tag mcp-guardrail@0.0.1 -m "neurodock-mcp-guardrail 0.0.1 — rumination detector + Phase-3 schema stubs (ADR 0006)"
git tag @neurodock/extension-browser@0.0.1 -m "@neurodock/extension-browser 0.0.1 — WXT scaffold for Chrome/Firefox/Edge"
git tag neurodock-evals@0.0.1 -m "neurodock-evals 0.0.1 — harness + seed corpus structure"
git tag asd-meeting-translator@0.1.0 -m "asd-meeting-translator skill 0.1.0 — transcript → four-section brief"
git tag v0.2.0 -m "Phase 2 developer preview umbrella tag — see RELEASE_NOTES_v0.2.0.md"
git push origin --tags
```

The push of `v0.2.0` triggers `.github/workflows/release.yml`. Skill packages
are **not** published via npm or PyPI in this release — they ship via the
federated registry once Phase 3 lands. The `asd-meeting-translator@0.1.0` git
tag exists for changelog / audit purposes only.

---

## 5. Watch the publish workflow

`.github/workflows/release.yml` runs two jobs in parallel:

- **`npm`** — runs `changesets/action` with `publish: pnpm release`. Requires `NPM_TOKEN` secret. Publishes `@neurodock/extension-browser` to npm under `access: public`.
- **`pypi`** — builds every `packages/mcp-*`, `packages/clinical`, `packages/evals` with `uv build` and publishes each `dist/` via `uv publish --token "$PYPI_TOKEN"`. Requires `PYPI_TOKEN` secret.

Open `https://github.com/tlennon-ie/neurodock/actions` and watch both jobs to
completion. **Do not start the smoke tests until both jobs report success.**

If either job fails partway through, **stop**. Engage the rollback path
in §7. Do not retry blindly.

---

## 6. Post-publish smoke tests

In a fresh clone or a clean container:

```bash
# Python — install from PyPI and import each entrypoint
pip install neurodock-mcp-translation==0.0.1
pip install neurodock-mcp-guardrail==0.0.1
pip install neurodock-evals==0.0.1
python -c "from neurodock_mcp_translation.server import app; print('translation ok')"
python -c "from neurodock_mcp_guardrail.server import app; print('guardrail ok')"
python -c "import neurodock_evals; print('evals ok')"

# npm — install from registry
npm view @neurodock/extension-browser@0.0.1 version
```

All four must succeed before announcing.

---

## 7. Rollback path

### npm (`@neurodock/extension-browser`)

- npm allows `npm unpublish` within **72 hours** of publish if no version has been replaced. Beyond that, use `npm deprecate`.
- Command: `npm unpublish @neurodock/extension-browser@0.0.1` (within window), or `npm deprecate @neurodock/extension-browser@0.0.1 "<reason>"`.

### PyPI (the three Python packages)

- PyPI does **not** support true unpublish. Only **yank** is available.
- Command: yank via the web UI on `pypi.org/project/<name>/0.0.1/` or `twine yank` (when available).
- Yanked versions remain installable when pinned but no longer satisfy `>=` resolution.

### Git tags

- Delete the offending tag locally and remotely:
  ```bash
  git tag -d <tag>
  git push origin :refs/tags/<tag>
  ```
- Open a `docs/post-mortems/2026-05-17-<package>.mdx` within 24 hours per `.claude/agents/release-pilot.md`.

### Browser extension stores

- Not applicable in v0.0.1 — no store submission happened. v0.0.2 store submission will add its own rollback path (re-push the prior signed build as a new version; store yanks are not supported).

---

## 8. Announce

Only after both publish jobs are green AND smoke tests pass:

- Publish `RELEASE_NOTES_v0.2.0.md` content to the GitHub Release for tag `v0.2.0`.
- Post to the docs site changelog (`packages/docs/src/content/docs/changelog/`).
- Post to `neurodock.org/blog` (long-form, ND-readable).
- Notify the outreach roster (the four prior-art maintainers from `outreach/emails/`).
- Update README badges if any reference version.

---

## 9. Abort path (before tagging)

If at any point during steps 1–3 the council decides to abort:

```bash
git reset --hard origin/main          # only on a personal release branch, never on shared main
```

Or, if version commits already merged:

- Open a revert PR for the version-bump commit.
- Mark this `RELEASE_TAG_PLAN_v0.2.0.md` superseded and write a new one.

No tags get pushed under the abort path. No artefacts ship. No rollback debt.
