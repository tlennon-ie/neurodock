# Contributing

Hello, you are welcome here. NeuroDock is an open-source, local-first
cognitive substrate for neurodivergent professionals. Small contributions
are the project's lifeblood, and the on-ramp is short — a new contributor
can land something useful inside fifteen minutes.

Before you start, skim `MANIFESTO.md` for the five principles,
`CODE_OF_CONDUCT.md` for how we treat each other, and `GOVERNANCE.md` for
how decisions get made. Then pick an on-ramp below.

## Two on-ramps

You do not need to know the whole project to contribute.

### Contribute a skill

A skill is a small, scoped bundle that activates inside an MCP-aware client
(Claude Code, Claude Desktop, Cursor, Cline). Skills are the most direct
way to externalise one piece of executive function.

Path from zero to first PR:

1. Fork the repository and create a branch `feat/skill/<short-name>`.
2. Copy an existing skill under `packages/skills/` as a template.
3. Edit `SKILL.md` with frontmatter (`name`, `description`, `neurotypes`,
 `triggers`).
4. Add at least three example invocations in `tests/`.
5. Open the PR.

Helper agent: `.claude/agents/skill-author.md`.

### Contribute code

Code contributions land in `packages/`. Most new code is either an MCP
server, a CLI command, or a piece of shared infrastructure in `core/`.

Path from zero to first PR:

1. Look at an existing MCP server under `packages/mcp-*/` for the scaffold
 pattern.
2. Pick a small, scoped issue or feature.
3. Branch as `feat/<area>/<short>` or `fix/<area>/<short>`.
4. Write a failing test first; make it pass; refactor.
5. Add a Changeset entry (`pnpm changeset`) and open the PR.

Helper agent: `.claude/agents/mcp-server-builder.md`.

## Pace yourself

You do not owe this project a fast turnaround. Async is the default. Open
the PR when it is ready; respond to reviews when you have the capacity;
close the laptop when you need to. No apologies needed for slow response.

If you need to step away from a PR you opened, say so in a comment ("AFK
indefinitely, feel free to take this over").

## Process checklist

Before you mark a PR ready for review:

- [ ] Changeset added for user-facing changes (`pnpm changeset`).
- [ ] Tests pass locally (`pnpm test`, `uv run pytest` where relevant).
- [ ] Conventional commit message on the PR title (`feat:`, `fix:`, `docs:`).
