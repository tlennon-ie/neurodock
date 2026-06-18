# NeuroDock skills

The per-neurotype skill library. Each skill lives in its own directory and ships a `SKILL.md` with standard frontmatter, plus a `tests/` directory with at least three example invocations replayed in CI.

This directory is intentionally **not** a workspace package — skills are content, not code. `packages/skills/` is the **source of truth**; users receive the skills through the delivery paths below.

## How a skill reaches a user

### Claude Code plugin (implemented)

The Claude Code plugin at `claude-code/neurodock/` auto-discovers skills from its own `claude-code/neurodock/skills/<name>/` directory. Each source skill's `SKILL.md` is **bundled verbatim** into that directory by the sync script:

```bash
node scripts/sync-skills.mjs          # write/refresh the plugin copies (idempotent)
node scripts/sync-skills.mjs --check  # verify only; exits non-zero on drift (CI)
```

The sync copies every `packages/skills/<name>/` that contains a `SKILL.md`, **excluding** the `tests/` directory (CI-only, never shipped) and the per-skill `README.md` / `CHANGELOG.md` (author docs). The top-level `packages/skills/README.md` is never copied.

A **drift guard** in `@neurodock/repo-tooling` (`packages/repo-tooling/tests/skills-bundle-drift.test.ts`) runs in the CI `TypeScript (lint, typecheck, test, build)` job. It fails the build if any source skill is missing from the plugin or differs from its bundled copy, so the bundle can never silently fall out of sync. The same invariant is enforced locally by `scripts/sync-skills.mjs --check`.

### CLI install (implemented)

Users who install via `@neurodock/cli` (rather than the marketplace plugin) get the skills too. Each source skill's `SKILL.md` is bundled into the published CLI tarball (generated at build time into `dist/assets/skills/<name>/SKILL.md` by `packages/cli/scripts/copy-assets.mjs` — the destination is under `dist/`, which is gitignored, so there is no committed third copy to drift). The command that delivers them:

```bash
neurodock install-skills            # copy skills into ~/.claude/skills/neurodock-<name>/
neurodock install-skills --dry-run  # print the planned targets, write nothing
```

`install-skills` copies each skill into the client's personal skills directory — `~/.claude/skills/` for both Claude Code and Claude Desktop — namespaced as `neurodock-<name>/SKILL.md`. Cursor has no skills system and is skipped with a notice. It is idempotent (re-running refreshes in place) and runs automatically as part of `neurodock install-all` / `neurodock setup` / `neurodock update` unless you pass `--no-skills`.

`packages/skills/` remains the single source of truth: the plugin copy is produced by `scripts/sync-skills.mjs` (with its drift guard), and the CLI tarball copy is produced by the CLI build step — both copy `SKILL.md` only and exclude `tests/`, `README.md`, and `CHANGELOG.md`.

## Launch skills

- `adhd-daily-planner` — Morning brief: what changed overnight, what matters today, one next-action per project.
- `audhd-context-recovery` — `/resume` command; reconstructs yesterday's mental state from the cognitive graph.
- `asd-meeting-translator` — Transcript to a four-section brief (my asks, others' asks, decisions, ambiguous).
- `ocd-decision-finalizer` — Surfaces prior decision evidence on repeat-validation requests; declines re-analysis without new information.
- `hyperfocus-formatter` — "Answer First" output structure on long sessions and design-critique surfaces.
- `visual-organizer` — Mermaid generation for overwhelm states.

## Authoring a new skill

1. Create `packages/skills/<name>/` with a `SKILL.md` (valid `name` + `description` frontmatter required by Claude Code) and a `tests/` directory with at least three example invocations.
2. Run `node scripts/sync-skills.mjs` to bundle it into the Claude Code plugin.
3. Commit both the source skill and the synced plugin copy. The CI drift guard enforces that they stay identical.
