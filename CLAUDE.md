# Working in this repository (AI-agent instructions)

This is a **public, open-source** repository. Average users and external
contributors clone it. Default to that audience for everything you commit.

## Repository hygiene — what does NOT belong in the tracked tree

Do **not** commit maintainer-internal, strategy, marketing, or audit documents
to this repo. Before creating any new top-level or `docs/` markdown file, ask:

> Would an average user or external contributor cloning this repo need this?

If the answer is no, it must not be tracked. Keep such files **out of the tree**
— either outside the repo, or untracked-and-gitignored locally (so the
maintainer keeps a working copy without publishing it).

**Internal — never commit to this repo:**

- Distribution / store-submission kits and reviewer notes (e.g. an
  `MCP-DISTRIBUTION.md`, `store-listings/`).
- Marketing / media / content-strategy docs and AI-image prompts.
- Internal audits (accuracy audits, internal branding notes, competitive notes).
- Scratch / rolling working notes that duplicate the per-package `CHANGELOG.md`.
- Anything containing submission credentials, form field dumps, or launch tactics.

**Public — belongs in the repo:**

- Standard root docs: `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `LICENSE`, `CHANGELOG.md`, `ETHICS.md`, `GOVERNANCE.md`,
  `MANIFESTO.md`, `ROADMAP.md`, `PRIVACY.md`.
- The documentation site under `docs/src/content/docs/` (this is what ships to
  docs.neurodock.org).
- Per-package `README.md` / `CHANGELOG.md`, ADRs the project chooses to publish,
  and code.

Do not proliferate root-level `*.md` files. When you think you need a new doc,
prefer extending an existing public doc or adding a page under the docs site.

## Commit conventions (this repo's hooks will reject otherwise)

- **commitlint**: the subject line must be **all lowercase** — no capitalised
  words, including acronyms (`mcp`, `codeql`, `tab`, not `MCP`/`CodeQL`/`Tab`).
- A `mixed-line-ending` pre-commit hook normalises CRLF→LF and **aborts the
  first commit** after rewriting the file. Re-stage the file and commit again.
- Conventional-commit types: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`,
  `test`, `perf`, `style`.

## CI gotchas

- `main` branch protection does **not** require the
  `TypeScript (lint, typecheck, test, build)` or `axe-core` checks, so a PR can
  auto-merge while those are red. Before merging a PR that touches `docs/` or the
  browser extension, confirm those checks are green — "mergeable" ≠ "all green".
- MDX gotcha: any `<word ...>` in `.mdx` prose is parsed as JSX and breaks
  `astro build`. Wrap placeholders in backticks. Verify docs with
  `pnpm --filter @neurodock/docs build` before pushing.
