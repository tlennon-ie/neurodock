# @neurodock/cli changelog

## 0.3.0

### Added

- `neurodock install-all` — single-command first-time install. Detects
  whether `uv` is on PATH (preferred) and falls back to `python -m pip`,
  then installs the six Python MCP servers (`neurodock-mcp-chronometric`,
  `neurodock-mcp-cognitive-graph`, `neurodock-mcp-task-fractionator`,
  `neurodock-mcp-translation`, `neurodock-mcp-guardrail`,
  `neurodock-evals`), verifies each entrypoint is on PATH with
  `<command> --help`, and runs `neurodock init` to wire MCP clients —
  collapsing six `pip install` lines plus an `init` into one command.
  Flags: `--client`, `--profile`, `--installer <uv|pip|auto>`,
  `--skip-install`, `--yes`, `--dry-run`. Exit codes: 0 on success,
  1 if any entrypoint is missing from PATH, 2 if init fails.
- `neurodock examples` — copy-pasteable prompt cheat-sheet that exercises
  every wired NeuroDock MCP tool. Detects which servers are wired across
  all detected client configs and prints 2–3 example prompts per server,
  each annotated with the underlying tool name. Flags: `--server <name>`
  to filter, `--json` for scripting. Honors `NO_COLOR` / `FORCE_COLOR`
  via the existing `colorEnabled()` helper.
- New tests: `tests/install-all.test.ts`, `tests/examples.test.ts`.

## 0.2.0 (unreleased)

### Added

- `neurodock host install` and `neurodock host uninstall` subcommands.
  Wire / unwire the optional Chrome Native Messaging host
  (`@neurodock/native-host`) so the browser extension reads and writes
  `~/.neurodock/profile.yaml` directly. Per-platform manifest dispatch
  lives in the host package; the CLI is a thin commander wrapper.
- `@neurodock/native-host` is now a workspace dependency.

Adds three top-level subcommands and bumps `prompts` into the dependency set.

- `neurodock validate` — Ajv-driven schema validation against `packages/core/schemas/profile.schema.json`. Reports field-path violations with `file:line` references. Supports `--file <path>` to validate an alternate file and `--strict` to flag unknown keys (default remains forward-compat per ADR 0004).
- `neurodock update` — re-runs the install adapters and rewrites stale NeuroDock MCP entries (version drift, command/args/cwd changes) in Claude Desktop, Claude Code, and Cursor configs. Non-NeuroDock entries and unrelated top-level keys round-trip untouched. Supports `--client <id>` and `--dry-run`.
- `neurodock uninstall` — reverses what `init` did. Removes NeuroDock MCP entries from each client config while preserving customisations. Asks (interactively) whether to delete `~/.neurodock/profile.yaml` and `~/.neurodock/cognitive-graph.sqlite`; defaults to no. `--yes` skips prompts but still preserves data unless `--purge` is passed. `--dry-run` prints the planned diff without writing.
- Adds `prompts@^2` (runtime) and `@types/prompts@^2` (dev) for the uninstall confirmation flow.
- New tests: `tests/validate.test.ts`, `tests/update.test.ts`, `tests/uninstall.test.ts`.

## 0.1.0

First implementation. Phase 1 deliverable.

- `neurodock init` — detect Claude Desktop, Claude Code, and Cursor on macOS, Linux, and Windows; install profile from `profile.example.yaml` (default) or `profile.minimal.yaml`; wire three Python MCP servers into the detected client configs.
- `neurodock doctor` — checklist diagnostic: Node >= 22, `uv` available, Python available, profile presence + schema validity, client config JSON syntax, NeuroDock server wiring.
- `neurodock profile validate` — Ajv-driven schema validation with field-path violation output.
- `neurodock profile show` — print the resolved profile with loader defaults applied (per ADR 0004 §15).
- `--dry-run` and `--yes` flags on `init`.
- Preserves existing `mcpServers` keys, comments in profile YAML, and unknown top-level keys (forward-compat per ADR 0004).
- 24+ unit tests across paths, validator, defaults, client adapters, init, and doctor.
