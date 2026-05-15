# @neurodock/cli changelog

## 0.1.0 (unreleased)

First implementation. Phase 1 deliverable per `plan.md` §11.

- `neurodock init` — detect Claude Desktop, Claude Code, and Cursor on macOS, Linux, and Windows; install profile from `profile.example.yaml` (default) or `profile.minimal.yaml`; wire three Python MCP servers into the detected client configs.
- `neurodock doctor` — checklist diagnostic: Node >= 22, `uv` available, Python available, profile presence + schema validity, client config JSON syntax, NeuroDock server wiring.
- `neurodock profile validate` — Ajv-driven schema validation with field-path violation output.
- `neurodock profile show` — print the resolved profile with loader defaults applied (per ADR 0004 §15).
- `--dry-run` and `--yes` flags on `init`.
- Preserves existing `mcpServers` keys, comments in profile YAML, and unknown top-level keys (forward-compat per ADR 0004).
- 24+ unit tests across paths, validator, defaults, client adapters, init, and doctor.
