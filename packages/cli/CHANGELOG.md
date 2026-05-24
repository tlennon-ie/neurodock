# @neurodock/cli changelog

## 0.6.0

### Added — `neurodock install-hooks` (proactive guardrails Phases 1 + 3)

One command wires NeuroDock's proactive-guardrail layer into a fresh
install. Bundled self-contained Python scripts ship with the npm
package — no extra `pip install` step.

```sh
neurodock install-hooks --self-test
neurodock install-hooks --install-daemon --self-test
neurodock install-hooks --uninstall
neurodock install-hooks --dry-run
```

The command:

1. Copies `proactive_guardrail.py` to `~/.neurodock/hooks/` (Phase 1
   Claude Code hook; auto-fires chronometric / rumination /
   sycophancy checks on every Nth tool use, banners on stderr).
2. Copies `neurodock_daemon.py` to the same dir (Phase 3 host-agnostic
   poller; same heuristics, native OS notifications).
3. Idempotently merges 4 entries into `~/.claude/settings.json`
   (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`), preserving
   any existing hooks from other tools.
4. With `--install-daemon`, registers the daemon at user-login
   autostart: HKCU Run on Windows, LaunchAgent on macOS, systemd
   `--user` unit on Linux.
5. With `--self-test`, runs both scripts' built-in smoke test to
   verify Python is on PATH and the heuristics fire.

**Opt-out:**

```sh
neurodock install-hooks --uninstall        # removes hook + daemon entries
export NEURODOCK_GUARDRAILS=off            # disables without removing
```

### Fixed — Windows path-escape lockout (regression-pinned)

Pre-0.6.0 the hook command written into `settings.json` used
backslashes on Windows. Bash-style shells (Git Bash / MinGW — what
Claude Code uses for hooks on Windows) interpret `\U`, `\h`, `\p`
etc. as escape sequences and strip them, mangling the path to
`pythonscript.py` and causing every PreToolUse hook to fail, which
**blocks every tool call** until the user manually edits
`settings.json`. The 0.0.22 install command hit this. Twice.

0.6.0 always normalises the script path to forward slashes (Python
accepts them on Windows) and always wraps it in double quotes. The
new install summary also echoes the exact hook command string so the
bug class can't recur silently.

Regression test: `packages/cli/tests/install-hooks.test.ts` pins the
contract — the test fails if any hook entry contains a backslash in
its script-path portion.

### Internals

- New build step `scripts/copy-assets.mjs` copies `src/assets/` into
  `dist/assets/` after `tsc`, so the published npm tarball contains
  the bundled Python scripts.
- `package.json` `files` array already includes `dist/`, so no
  manifest change needed.

## 0.5.0

### Changed (breaking)

- `neurodock update` now upgrades NeuroDock to the latest version
  (re-installs the six MCP servers via `pip install --upgrade` or
  `uv tool install` and re-wires clients). Previously, `update` only
  re-shaped client config JSON without touching package versions —
  which confused users who expected `update` to behave like every
  other CLI's `update` verb.
- The previous behavior moved to a new verb: `neurodock sync`. Same
  flags (`--client`, `--dry-run`), same code path, same semantics.
- The new `update` command accepts the same flags as `install-all`
  (`--client`, `--profile`, `--installer`, `--skip-install`, `--yes`,
  `--dry-run`, `--no-native-host`).

### Added

- README now has a dedicated `## Update` section documenting the
  one-liner: `npx --yes @neurodock/cli update`.

### Migration

If you scripted against `neurodock update --client X --dry-run` to
reconcile client configs, rename the call to `neurodock sync` — the
old flags still work there. If you wanted package upgrades, the new
`neurodock update` is what you were looking for.

## 0.4.3

### Changed

- `homepage` in `package.json` now points at https://neurodock.org/
  (was the GitHub README anchor). Repository link unchanged. Adds
  `bugs`, `keywords`, and richer `description` for the npm listing.
- README rewritten to lead with the new slogan ("A cognitive substrate
  that remembers, paces, and refuses"), reference NeuroDock by brand
  rather than as an internal monorepo, and add a Links section with
  the canonical home / docs / repo / issues / changelog URLs.

No behaviour change. Same surface as 0.4.2.

## 0.4.2

### Fixed

- `neurodock init` now wires all FIVE MCP servers into the MCP-aware
  client config, not just three. Previously chronometric +
  cognitive-graph + task-fractionator got registered but translation
  - guardrail were skipped — so users saw 3/5 servers in Claude even
    after a clean `install-all` + restart. The pip install registered
    the entrypoints; the CLI just wasn't pointing the client at them.
    `mcp-entries.ts` `NEURODOCK_SERVERS` list extended with the missing
    two. `examples` and `install-all` already iterated all five, so no
    changes there.

## 0.4.1

### Changed

- `neurodock install-all` now also registers the optional native-messaging
  host at the end of the run (previously a separate `neurodock host install`
  step). Brings first-time install to truly one command: pip-install the
  six MCP servers, wire the MCP-aware clients, and register the host the
  browser extension uses to read `~/.neurodock/profile.yaml`.
- New `--no-native-host` flag on `install-all` for users who don't want the
  browser-extension bridge wired (e.g. headless / server installs).
- Host-install failure is non-fatal: the whole command stays exit 0, prints
  a `[warn]` line, and tells the user they can re-run `neurodock host install`
  later. Rationale: the host is only useful if the user also installs the
  browser extension, so failing the entire first-time install over it is
  worse UX than warning.
- Added a "What this just did" three-bullet recap at the end of `install-all`
  so the user can see what was wired without re-reading the full log.
- New tests in `tests/install-all.test.ts`: happy-path host install,
  `--no-native-host` skip, host-failure warn-but-don't-fail.

## 0.4.0

### Added

- `neurodock plugin` command group for managing plugins under
  `~/.neurodock/plugins/` per ADR 0007. Six subcommands:
  - `plugin add <source>` — install a plugin from a local directory.
    Validates `plugin.yaml` against `plugin.schema.json` before copying
    into `~/.neurodock/plugins/<name>/`. Flags: `--yes`, `--dry-run`,
    `--force`. Exit codes: 0 ok, 1 source invalid, 2 already-installed
    without `--force`, 3 schema validation failure.
  - `plugin remove <name>` (alias: `uninstall`) — remove an installed
    plugin. Flags: `--yes`, `--dry-run`.
  - `plugin list` — list installed plugins with their enabled state.
    `--json` for machine-readable output.
  - `plugin enable <name>` — activate an installed plugin by writing a
    `.enabled` marker file into the plugin directory. The substrate's
    filesystem walk (per ADR 0007) treats marker presence as the
    single source of truth for activation; no central registry file
    is maintained.
  - `plugin disable <name>` — remove the `.enabled` marker without
    deleting the plugin files.
  - `plugin validate <source>` — schema-validate a plugin manifest
    without installing. `--json` flag for scripting. Exit codes: 0
    valid, 1 invalid, 2 `plugin.yaml` missing.
- New tests: `tests/plugin-add.test.ts`, `tests/plugin-remove.test.ts`,
  `tests/plugin-list.test.ts`, `tests/plugin-enable.test.ts`,
  `tests/plugin-disable.test.ts`, `tests/plugin-validate.test.ts`.
- `pluginsDir(env)` helper in `lib/paths.ts` resolves to
  `<profileDir>/plugins/` so tests that set `NEURODOCK_PROFILE_PATH`
  get an isolated plugin tree for free.

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

## 0.2.0

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
