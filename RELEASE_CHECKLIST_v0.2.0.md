# Release checklist — v0.2.0

**Walked by:** Council member cutting the release.
**Companion docs:** `RELEASE_NOTES_v0.2.0.md`, `RELEASE_TAG_PLAN_v0.2.0.md`.

Do not begin step 1 of the tag plan until every box below is checked.

---

## 1. Documents reviewed

- [ ] `RELEASE_NOTES_v0.2.0.md` read end-to-end; "What shipped", "Deferred", and "Known limitations" reflect the actual diff.
- [ ] `RELEASE_TAG_PLAN_v0.2.0.md` read end-to-end; all commands understood.
- [ ] Each package's `CHANGELOG.md` reviewed and confirmed complete:
  - [ ] `packages/mcp-translation/CHANGELOG.md` — v0.0.1 entry present.
  - [ ] `packages/mcp-guardrail/CHANGELOG.md` — v0.0.1 entry present.
  - [ ] `packages/extension-browser/CHANGELOG.md` — v0.0.1 entry present.
  - [ ] `packages/evals/CHANGELOG.md` — v0.0.1 entry present.
  - [ ] `packages/skills/asd-meeting-translator/SKILL.md` — frontmatter `version: 0.1.0` present.

## 2. Workspace + build hygiene

Run from a **fresh clone** (or `git clean -fdx` and re-bootstrap):

- [ ] `pnpm install --frozen-lockfile` clean.
- [ ] `uv sync --all-packages --all-extras` clean.
- [ ] `pnpm turbo run lint typecheck test build` green across the workspace.
- [ ] `uv run pytest` green — currently expected: 169 passed, 1 xfailed by design.
- [ ] `uv run ruff check packages/` clean.
- [ ] `uv run mypy --strict packages/{mcp-chronometric,mcp-cognitive-graph,mcp-task-fractionator,mcp-translation,mcp-guardrail,clinical,evals}/src/` clean.
- [ ] `pnpm --filter @neurodock/docs build` green.

## 3. CI green on main

- [ ] `gh run list --branch main --limit 5` shows the latest run for every workflow (`ci.yml`, `release-dry-run` if present) green.
- [ ] No failing required checks on the merge commit.

## 4. Council and lived-experience gates

- [ ] **Clinical-reviewer sign-off on `mcp-guardrail` v0.0.1** captured in the release issue, with commit hash. (ADR 0006 §5, `ETHICS.md` commitment 3.)
- [ ] **Lived-experience review on `asd-meeting-translator` v0.1.0** by ≥ 1 autistic reviewer per `CODEOWNERS` — recorded in the PR thread.
- [ ] **Lived-experience review on the rumination advisory copy** by ≥ 1 OCD-identified reviewer.
- [ ] **Eval corpus structure validated** — `pytest packages/evals/tests/` green; ten seed examples load.
- [ ] **Field-study readiness signal** from `clinical-reviewer` recorded — protocol drafted, recruitment plan exists, IRB-equivalent review path documented.
- [ ] **Council formal approval** per `GOVERNANCE.md` — simple majority recorded for the v0.2.0 umbrella.

## 5. Release secrets present

- [ ] `NPM_TOKEN` secret present in GitHub Actions secrets (npm publish for `@neurodock/extension-browser`).
- [ ] `PYPI_TOKEN` secret present in GitHub Actions secrets (PyPI publish for the three Python packages).
- [ ] Both tokens scoped to publish-only where the registry supports it.

## 6. Tag plan dry-run

- [ ] `pnpm changeset version` executed on a throwaway branch; diff inspected; matches expectations from `RELEASE_TAG_PLAN_v0.2.0.md` §1.
- [ ] `uv build` executed against each Python package; tarball `pyproject.toml` shows `version = "0.0.1"`.
- [ ] `pnpm --filter @neurodock/extension-browser publish --dry-run --no-git-checks` clean.

## 7. Cut the release

Now follow `RELEASE_TAG_PLAN_v0.2.0.md` steps 1 through 8 in order.

- [ ] Step 1 — consume changesets (PR merged to main).
- [ ] Step 2 — Python + skill bumps committed.
- [ ] Step 3 — dry-run publish clean.
- [ ] Step 4 — tags pushed.
- [ ] Step 5 — `release.yml` `npm` job green.
- [ ] Step 5 — `release.yml` `pypi` job green.
- [ ] Step 6 — post-publish smoke tests green (Python imports + `npm view` versions).
- [ ] Step 8 — GitHub Release created with `RELEASE_NOTES_v0.2.0.md` content.
- [ ] Step 8 — docs site changelog updated.
- [ ] Step 8 — blog post at `neurodock.org/blog`.
- [ ] Step 8 — outreach roster notified (the four prior-art maintainers from `outreach/emails/`).
- [ ] Step 8 — README badges refreshed if any reference version.

## 8. Post-release

- [ ] Release issue closed.
- [ ] Phase 2 milestone updated (open items moved to Phase 3 milestone).
- [ ] `community-triage` watch set on `#releases` / GitHub Discussions for 72 hours.
- [ ] If any rollback fires, post-mortem opened at `docs/post-mortems/2026-05-17-<package>.mdx` within 24 hours.

---

## Friday rule

Per `.claude/agents/release-pilot.md` "common failure modes": do not cut this
release on a Friday afternoon UTC. If it is Friday after 12:00 UTC, defer to
Monday morning. The rollback window is closed for two days otherwise.
