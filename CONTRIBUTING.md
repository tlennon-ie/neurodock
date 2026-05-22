# Contributing

Hello, you are welcome here. NeuroDock is an open-source, local-first
cognitive substrate for neurodivergent people. Small contributions
are the project's lifeblood, and the on-ramp is short — a new contributor
can land something useful inside fifteen minutes.

**If you only have 5 minutes:** open an issue describing one thing you
tried that didn't work the way you expected. That's a valid, valued
contribution — no PR required, no setup required.

When you have capacity, `MANIFESTO.md`, `CODE_OF_CONDUCT.md`,
`GOVERNANCE.md`, and `ROADMAP.md` give the project's context — but you
don't need to read all four to land a fix.

## Pick a lane first

The four PR-size lanes below describe what kinds of contributions land
where. Skim them and pick one that matches the time and energy you have
right now. **Then** worry about setup or the changeset flow.

## Bootstrap in one command (when you need it)

```bash
./scripts/dev-setup.sh
```

Installs JS + Python dependencies, builds the workspace, runs the test
suites. Re-runnable after every `git pull`. See `scripts/README.md` for
prerequisites.

Once that's green, `examples/claude-desktop/README.md` is a worked
end-to-end walkthrough — useful if you want to feel how the substrate
behaves before changing it. Skip it if you already know.

## Four PR-size lanes

Pick the lane that matches the time and energy you actually have right now.
None of these are second-class — a one-line typo fix and a multi-day
architectural change both move the project forward.

### Lane 1 — ~15 minutes (drive-by)

For when you noticed something while reading. No need to set up the dev
environment for these.

- Fix a typo, broken link, or stale reference in the docs
- Improve an error message
- Add a missing entry to a `README.md`
- Clarify an ambiguous sentence in `MANIFESTO.md` or `GOVERNANCE.md`
- Add a missing test case for an existing behaviour

Branch as `docs/<short>` or `fix/<area>/<short>`. Skip the changeset.

### Lane 2 — One afternoon

For when you have focused time but want a self-contained scope.

- Contribute a new **skill** — copy an existing one under `packages/skills/`,
  edit `SKILL.md` frontmatter (`name`, `description`, `neurotypes`,
  `triggers`), add three example invocations under `tests/`.
  Helper agent: `.claude/agents/skill-author.md`.
- Add a new tool to an existing MCP server (e.g. another query type on
  cognitive-graph). Write the schema, the handler, the test.
- Wire a new MCP client into `cli init` (Cursor, Cline, Zed config writers
  follow the Claude Desktop pattern in `packages/cli/`).
- Port a "good first issue" labelled task.

Branch as `feat/<area>/<short>`. Add a changeset.

### Lane 3 — Multi-day

For substantial work. Open an issue first to align scope; otherwise you
risk doing work the maintainers can't merge.

- A new MCP server (e.g. an attention-budget tracker, a sensory-load
  estimator). Look at `packages/mcp-chronometric/` for the scaffold.
- A new CLI command beyond `init` / `doctor`.
- Architectural changes to `packages/core/`.
- Implementing one of the deferred detectors (hyperfocus, sycophancy).
- New language support in the translation server.

Branch as `feat/<area>/<short>`. Changeset required. Expect 2–4 review
rounds.

### Lane 4 — No-code

You do not need to write code to contribute meaningfully.

- Run the substrate for a week and file a single issue describing where
  it broke down for your neurotype.
- Review an open PR — especially one touching a neurotype you live with.
  Lived-experience review is genuinely useful and explicitly welcomed.
- Improve the documentation tone in `MANIFESTO.md` / `ETHICS.md` for
  clarity, accessibility, or warmth.
- Triage older issues — label, close stale ones, ask follow-up questions.
- Translate a doc into another language (open an issue first).

Branch as `docs/<short>` for doc work, or just comment on the PR.

## Pace yourself

You do not owe this project a fast turnaround. Async is the default. Open
the PR when it is ready; respond to reviews when you have the capacity;
close the laptop when you need to. No apologies needed for slow response.

If you need to step away from a PR you opened, say so in a comment ("AFK
indefinitely, feel free to take this over").

## Finding something to work on

- GitHub label [`good first issue`](https://github.com/neurodock/neurodock/labels/good%20first%20issue)
  — sized for the Lane 1 / Lane 2 scope.
- `ROADMAP.md` lists what's prioritised in the current and next milestone.
- Any TODO comment in the codebase tagged with an issue number is fair game.

If nothing on either list speaks to you and you have an idea, open an issue
describing the problem (not the solution) and we'll discuss before you
invest time.

## Worked example — adding a changeset

For anything in Lanes 2 or 3 that changes user-facing behaviour, add a
changeset entry. (Lane 1 doc-only edits skip this step.) The flow:

```bash
# 1. Make your code change and commit it
git checkout -b feat/cli/morning-anchor
# ... edit files ...
git add packages/cli/src/commands/morning-anchor.ts
git commit -m "feat(cli): add morning-anchor command"

# 2. Run the changeset CLI
pnpm changeset
```

`pnpm changeset` is interactive. It asks:

```
?  Which packages would you like to include? ...
   ◉ @neurodock/cli
   ◯ @neurodock/core
   ◯ @neurodock/native-host

?  Which packages should have a major bump? (none)
?  Which packages should have a minor bump? @neurodock/cli
?  Please enter a summary for this change:
>  Add morning-anchor command: prints a structured day-start prompt.
```

It writes a markdown file under `.changeset/` — commit that file:

```bash
git add .changeset/*.md
git commit -m "chore: changeset for morning-anchor"
git push -u origin feat/cli/morning-anchor
```

Then open the PR. Releases pick up the changeset automatically.

## Before opening a PR

Run the version-impact pre-flight locally to see whether your diff
expects a `package.json` / `pyproject.toml` bump, a CHANGELOG entry, or
a docs cross-reference update:

```bash
bash .github/scripts/version-impact.sh
```

Same logic lives in the repo skill at `.claude/skills/version-impact/`
(invokable as `/version-impact` from Claude Code), and the GitHub
Actions workflow `pr-version-check.yml` runs it on every PR and posts
the report as a sticky comment. The workflow is advisory — it never
fails the build, it just tells you what looks missing so you can fix
it before the maintainers ask.

## Process checklist

Before you mark a PR ready for review:

- [ ] Changeset added for user-facing changes (`pnpm changeset`).
- [ ] Tests pass locally (`pnpm test`, `uv run pytest` where relevant).
- [ ] Conventional commit message on the PR title (`feat:`, `fix:`, `docs:`).
- [ ] PR description explains _why_, not just _what_.
- [ ] Version-impact pre-flight clean, or any flagged items consciously left.
