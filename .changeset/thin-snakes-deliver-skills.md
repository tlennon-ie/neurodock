---
"@neurodock/cli": minor
---

add `neurodock install-skills` and bundle the per-neurotype skills into the cli

the cli now ships the six per-neurotype skills (their `SKILL.md` files,
generated into `dist/assets/skills/` at build time from `packages/skills/`).
the new `neurodock install-skills` command copies them into the client's
personal skills directory (`~/.claude/skills/neurodock-<name>/` for claude code
and claude desktop; cursor is skipped). it supports `--client`, `--dry-run`,
and `--yes`, and is idempotent.

`install-all`, `setup`, and `update` now install the skills as part of the
one-command happy path; opt out with `--no-skills` (mirrors `--no-native-host`).
the skills step is best-effort — a failure warns but does not fail the command.
