# @neurodock/cli changelog

## 0.2.0 (unreleased)

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
