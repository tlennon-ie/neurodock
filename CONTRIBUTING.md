# Contributing

Hello, you are welcome here. NeuroDock is an open-source, local-first cognitive substrate for neurodivergent professionals, built mostly by neurodivergent contributors. Your first pull request matters — small contributions are the project's lifeblood, and we deliberately keep the on-ramp short so a new contributor can land something useful inside fifteen minutes.

Before you start, skim `MANIFESTO.md` for the five principles, `CODE_OF_CONDUCT.md` for how we treat each other, and `GOVERNANCE.md` for how decisions get made. Then pick an on-ramp below.

## Three on-ramps

You do not need to know the whole project to contribute. Each on-ramp below stands on its own and links to the build-time agent that helps you finish.

### Contribute a skill

A skill is a small, scoped bundle that activates inside an MCP-aware client (Claude Code, Claude Desktop, Cursor, Cline). Skills are the most direct way to externalise one piece of executive function for one neurotype.

Path from zero to first PR:

1. Fork the repository and create a branch `feat/skill/<short-name>`.
2. Copy `packages/skills/_template/` to `packages/skills/<your-skill>/`.
3. Edit `SKILL.md` with frontmatter (`name`, `description`, `neurotypes`, `triggers`).
4. Add at least three example invocations in `tests/`.
5. Run `pnpm test --filter @neurodock/skills` and open the PR.

Reference: `MANIFESTO.md` §3 (lived experience leads). Helper agent: `.claude/agents/skill-author.md`.

### Contribute an eval example

The eval corpus is how we measure whether translation, guardrails, and tone-checking actually work. Real, consented, anonymised examples from working professionals are the single highest-leverage contribution for non-coders.

Path from zero to first PR:

1. Read `packages/evals/CONTRIBUTING.md` for the consent and anonymisation checklist.
2. Strip identifying details from your example (names, projects, employers, dates).
3. Add the example as YAML under `packages/evals/corpora/<area>/`.
4. Tag the example with the relevant neurotype, axis, and confidence rating.
5. Open the PR; the `eval-curator` agent and a human reviewer will check anonymisation before merge.

Helper agent: `.claude/agents/eval-curator.md`.

### Contribute code

Code contributions land in `packages/`. Most new code is either an MCP server, a CLI command, or a piece of shared infrastructure in `core/`.

Path from zero to first PR:

1. Read `packages/_template-mcp/README.md` for the scaffold pattern.
2. Pick a small, scoped issue tagged `good-first-issue` or `help-wanted`.
3. Branch as `feat/<area>/<short>` or `fix/<area>/<short>`.
4. Write a failing test first; make it pass; refactor.
5. Add a Changeset entry (`pnpm changeset`) and open the PR.

Helper agent: `.claude/agents/mcp-server-builder.md`.

## Pace yourself

You do not owe this project a fast turnaround. Async is the default. Open the PR when it is ready; respond to reviews when you have the capacity; close the laptop when you need to.

No apologies needed for slow response. We do not interpret latency as disinterest, and we do not ping contributors who have not replied. The burnout protocol in `GOVERNANCE.md` applies to maintainers; the same spirit applies to every contributor.

If you need to step away from a PR you opened, say so in a comment ("AFK indefinitely, feel free to take this over"). The community-triage agent reassigns or closes with credit.

## Process checklist

Before you mark a PR ready for review:

- [ ] Changeset added for user-facing changes (`pnpm changeset`).
- [ ] Tests pass locally (`pnpm test`, `uv run pytest` where relevant).
- [ ] Accessibility pass run on UI or skill output (`axe-core`, manual check).
- [ ] If the PR targets a specific neurotype, request an ND reviewer with that lived experience via the `neurotype:<tag>` label.
- [ ] Conventional commit message on the PR title (`feat:`, `fix:`, `docs:`, etc.).

CI runs the rest automatically. Two reviewers approve: one core maintainer plus, where applicable, one with the relevant lived experience.

## Good first PRs

Three examples of small, high-confidence first contributions:

- Add an eval example to `packages/evals/corpora/translation/` from one of your own (anonymised) work messages.
- Fix a typo or improve a paragraph in `docs/` — the documentation site uses Astro Starlight and ships from `main`.
- Add a test case to an existing skill that exercises a real situation you have run into.

If none of these fit, open an issue describing what you want to contribute. The community-triage agent will help you find an on-ramp.

## Alignment with the master plan

This document operationalises Sections 3, 5, and 12 of `plan.md` — the contribution surface, the plugin protocol, and the contributor on-ramp commitment. Changes to those sections must update this file in the same pull request.
