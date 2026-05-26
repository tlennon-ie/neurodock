# Changelog

This is the **index** of release history. Each package has its own
`CHANGELOG.md` next to its source. Conventional Commits + Changesets drive
the per-package files; this index just points at them and summarises
repo-wide milestones.

## Repo-wide releases

### [unreleased]

- **Hygiene (audit M4)** — SPDX AGPL-3.0-or-later headers added to ~232 source files across all packages. No functional change.

### v0.2.3 — 2026-05-24

Proactive-guardrails week. The substrate's safety surfaces — chronometric
breaks, hyperfocus warnings, rumination flags — now auto-fire instead of
waiting for the user to remember to call them. Plus the LM Studio + Gmail
silent-failure fix that closed the top outstanding extension bug.

- **CLI v0.6.0** — `neurodock install-hooks` wires NeuroDock's proactive
  guardrail layer into a fresh install. Bundled stdlib-only Python
  scripts; no extra `pip install` step. Three artefacts: a Claude Code
  hook (`SessionStart` / `PreToolUse` / `PostToolUse` / `Stop`), an
  optional host-agnostic standalone daemon registered for autostart, and
  a regression-pinned Windows-path fix that prevents the 0.0.22-class
  hook-command lockout. Opt-out via `NEURODOCK_GUARDRAILS=off`.
- **`neurodock-mcp-cognitive-graph` v0.0.4** — `record_fact` now returns
  friendly, actionable errors when the caller sends wrong-shape input.
  The `ToolError` payload gained `hint` and `example` fields so every
  failure mode on the boundary surfaces "do this next" instead of a raw
  Pydantic error. Closes the six-retry validation loop logged on
  2026-05-22.
- **Browser extension v0.0.17 → v0.0.24** — seven sideload-only
  releases across the week, all in service of making the in-page
  panel work the way users expected. Highlights:
  - **v0.0.24** — LM Studio + Gmail silent-failure fix (the #1
    outstanding bug). Service-worker keepalive defeats the MV3 idle
    kill mid-fetch; new ACK contract on `chrome.tabs.sendMessage`
    defeats the ambiguous-resolution delivery bug. Plus a settings UI
    for the proactive-guardrail watchdog.
  - **v0.0.23** — proactive watchdog in the SW (hyperfocus / deep-night
    / rumination-host) plus generic content-script injection so the
    panel mounts on any site, not just the nine declared host-permission
    matches.
  - **v0.0.22** — per-neurotype prompt tailoring across all five
    translation prompts (ADHD / ASD / AuDHD / OCD / dyslexia /
    dyspraxia / Tourette / other), reader-preferences UI in Settings,
    toolbar-action progress + outcome badge, structural JSON repair
    for truncated gemma output, HTTP-CSP fix for local dev servers.
  - **v0.0.17–v0.0.21** — incremental fixes: LM Studio base64-encoded
    images, model-list fetch proxied via SW (CORS), CSP widened for
    arbitrary HTTPS image hosts, per-host permission requested at
    right-click time, sync-callback fix so the permission prompt
    actually fires, canvas-snapshot fallback for auth-gated /
    inaccessible images, HTTP CSP for local dev servers, clickable
    History rows with full request + response, source-image
    thumbnails in History detail.
- **CLI tests** 105/105 passing; **extension-browser tests** 260/260
  passing; **mcp-cognitive-graph tests** 54/54 passing.

### v0.2.2 — 2026-05-21

Agent-driven expansion of the developer preview. No breaking changes;
everything in v0.2.1 still works the same way.

- **Browser extension v0.0.2** — real LLM providers shipped: Ollama
  (local default), Anthropic, OpenAI, and OpenRouter (including
  `openrouter/auto`, OpenRouter's auto-router that picks the best
  model per query). Settings tab, API-key masking, schema-validated
  responses, streaming on all four providers. PR #33.
- **CLI v0.4.0** — `install-all` (one-command first-time install),
  `examples` (prompt cheat-sheet per wired server), and the new
  `plugin add / remove / list / enable / disable / validate`
  subcommands for out-of-tree plugin management.
- **Profiles** — three new presets: `dyspraxia`, `burnout-recovery`,
  `educator-semester`, `student-university` (four new; nine total
  under `profiles/`).
- **Skill plugins** — five new shipped under `plugins/`:
  `skill-civil-servant-briefing`, `skill-eng-manager-1on1`,
  `skill-lawyer-matter`, `skill-researcher-litreview`,
  `skill-writer-long-form`. Plus the previously shipped
  `skill-pm-stakeholder-juggle`, `skill-software-engineer-daily`,
  and `example-skill-pomodoro` template.
- **Translation packs** — three new shipped under `plugins/`:
  `translation-customer-support`, `translation-healthcare`,
  `translation-sales`. Plus the previously shipped
  `translation-german-directness`, `translation-hiberno-english`,
  `translation-japanese-keigo`, `translation-legal`.
- **Worked examples** — two new added under `examples/` to complement
  the existing Claude Desktop walkthrough.
- **Docs / README** — front-door rewrite: TL;DR block, MCP defined on
  first mention, restart-Claude promoted to a numbered step, status
  table refreshed, gating language softened. New top-level
  `PRIVACY.md`.

### v0.2.1 — 2026-05-20 (developer preview)

Three substrate pillars built, on `main`, installable from npm + PyPI.

- All six MCP servers published to PyPI.
- CLI shipped with `init`, `doctor`, `validate`, `update`, `uninstall`,
  `host install/uninstall`, `profile show/validate`.
- Guardrail v0.0.2 — all three detectors live (rumination, hyperfocus,
  sycophancy).
- Task-fractionator v0.0.2 — ISO 8601 duration parsing clarified.
- Cognitive-graph v0.0.2 — 4-rung resolution cascade
  (exact → alias → fuzzy → embedding).
- Native-host v0.1.0 — optional Chrome Native Messaging bridge.

### v0.2.0 — 2026-05-19

- Six MCP servers initial publish.
- Five launch skills.

### v0.1.0 — 2026-05-18

- Repo bootstrap, monorepo tooling, Astro Starlight docs site.

## Per-package changelogs

### TypeScript packages (npm)

- [`@neurodock/cli`](./packages/cli/CHANGELOG.md)
- [`@neurodock/core`](./packages/core/CHANGELOG.md)
- [`@neurodock/native-host`](./packages/native-host/CHANGELOG.md)
- [`@neurodock/extension-browser`](./packages/extension-browser/CHANGELOG.md)

### Python packages (PyPI)

- [`neurodock-mcp-chronometric`](./packages/mcp-chronometric/CHANGELOG.md)
- [`neurodock-mcp-cognitive-graph`](./packages/mcp-cognitive-graph/CHANGELOG.md)
- [`neurodock-mcp-task-fractionator`](./packages/mcp-task-fractionator/CHANGELOG.md)
- [`neurodock-mcp-translation`](./packages/mcp-translation/CHANGELOG.md)
- [`neurodock-mcp-guardrail`](./packages/mcp-guardrail/CHANGELOG.md)
- [`neurodock-clinical`](./packages/clinical/CHANGELOG.md)
- [`neurodock-evals`](./packages/evals/CHANGELOG.md)

## How releases work

1. PRs land with a Changesets entry under `.changeset/` describing
   user-facing changes.
2. A maintainer cuts a release by merging the Changesets "Version
   packages" PR, which bumps package versions and assembles the
   per-package CHANGELOG entries.
3. Tagging triggers `.github/workflows/release.yml` which publishes
   npm + PyPI in parallel.
4. This index is updated by hand for repo-wide milestones — not every
   single package bump warrants an entry here.

See `CONTRIBUTING.md` for the changeset workflow.
