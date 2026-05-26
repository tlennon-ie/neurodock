# @neurodock/cli changelog

## 0.7.1

### Fixed — Windows: daemon autostart no longer flashes a black console window

The 0.7.0 HKCU Run entry used `python.exe` (console subsystem) which
flashed a visible terminal window on every Windows login. Switched to
`pythonw.exe` (windows subsystem — same interpreter, no console).
The post-install detached spawn in `install-hooks` does the same and
also passes `windowsHide: true` on the spawn options. No behavioural
change on macOS or Linux. Existing 0.7.0 installs should re-run
`neurodock install-hooks --install-daemon` to refresh the Run entry.

## 0.7.0

### Fixed — proactive-guardrail wiring after 2026-05-26 silent-failure incident

The user spent 6 hours coding without a single break warning from the
substrate. Diagnosis: the Phase 1 hook was writing a degraded session
shape (`{tool_count: N}` with no `started_at`), and the Phase 3 daemon
had never been started on the machine — only registered for autostart,
which would have fired at next login (i.e. never, in a long session).
Three plumbing fixes, no new heuristics or severity tiers (clinical
ETHICS contract honoured — `mcp-guardrail` unchanged):

- **Phase 1 hook defensive bootstrap**: on `PreToolUse`, if
  `started_at` is missing from session state, set it to `now()`
  rather than silently degrade. Adds `last_active_at` on each
  PreToolUse for the same reason. The existing elapsed-time
  heuristic can finally compute against a real anchor.
- **`neurodock install-hooks --install-daemon` now actually starts
  the daemon** after registering autostart, via a detached + unref'd
  spawn. Previously it only set up the HKCU Run / LaunchAgent /
  systemd-user entry, which means the user had to log out + back in
  to see the first daemon tick.
- **`neurodock guardrail status`**: new read-only diagnostic
  subcommand that prints which pieces of the wiring are present
  (hook registered? session shape healthy? daemon script on disk?
  autostart registered? daemon alive in last 15 min?) so the user
  can see at a glance which piece is missing before another long
  session goes silent.

No heuristic thresholds touched. No clinical sign-off required.

### Security — atomic writes for CLI scaffolding (TOCTOU defence)

`neurodock init`, `neurodock install-hooks`, and `neurodock plugin enable` previously
used an `existsSync` check followed by a separate `writeFileSync`, leaving a
TOCTOU (time-of-check / time-of-use) window in which a local attacker could swap the
target path for a symlink between the two calls. All three sites now use atomic
write primitives: new-file creation uses `O_CREAT | O_EXCL` (one kernel operation
that makes the check-and-create atomic), while update-in-place sites write to a
unique `.pid.ts.tmp` sibling and rename it into place — rename is atomic on POSIX
and best-effort on Windows. A shared helper `src/util/atomic-write.ts` encapsulates
both patterns.

### Fixed — Python hooks no longer swallow exceptions silently

Seven `except …: pass` blocks in `proactive_guardrail.py` and `neurodock_daemon.py`
were changed to `except Exception as exc:` with structured logging. The affected
sites are session-end timestamp parsing, session-file saves, prompt-file saves, log
writes, and the daemon dedup-timestamp parse. `KeyboardInterrupt` and `SystemExit`
continue to propagate because `except Exception` excludes them by design. The log
write itself falls back to a minimal `sys.stderr` line to avoid infinite recursion.

### Fixed — notification-text escape hardened (M5)

`_escape()` in `neurodock_daemon.py` was split into two context-aware functions,
`_escape_ps()` (PowerShell) and `_escape_as()` (AppleScript). Both strip the full
set of shell-metacharacters that the original single-function omitted: backtick,
`$(){}`, `;&|<>`, and backslash for PowerShell; `\\&|;\`` for AppleScript.
Unit tests in `packages/cli/src/assets/hooks/test_daemon_escape.py` assert that
injection payloads containing all dangerous characters produce literal-text output.

## 0.6.2

### Fixed — `neurodock --version` was hardcoded and stale (read package.json instead)

`src/index.ts` held `export const CLI_VERSION = "0.5.0"`. The string
went stale at every release: 0.6.0 reported `0.5.0`, 0.6.1 also
reported `0.5.0`. Fresh users running `neurodock --version` saw a
number that didn't match what they'd just installed and reasonably
concluded the install was broken.

0.6.2 reads the version from the package's own `package.json` at
module load. Works from both `dist/index.js` (the published path)
and `src/index.ts` when run via tsx during dev. Impossible to drift
again.

No other behaviour change vs 0.6.1. If you're already on 0.6.1, this
is purely cosmetic and you can skip it; new installs should jump
straight to 0.6.2.

## 0.6.1

### Fixed — `npm install` was broken for every fresh user (workspace: protocol leaked)

`@neurodock/cli@0.6.0` was published with `npm publish`, which does NOT
rewrite pnpm's `workspace:` protocol into a real semver range. The
resulting tarball's `package.json` carried:

```json
"@neurodock/native-host": "workspace:^0.1.0"
```

…which npm/yarn cannot resolve, so the very first `npx --yes
@neurodock/cli@latest <anything>` failed with `EUNSUPPORTEDPROTOCOL`
on every fresh machine. The CLI was effectively unpublishable for the
~14 hours between 0.6.0 hitting npm and this patch.

**The fix:** 0.6.1 is published via `pnpm publish`, which rewrites
the `workspace:` prefix to the real version pinned in the workspace
(`^0.1.0`). Verified locally by `pnpm pack` + inspecting the
extracted `package.json`.

**Belt-and-braces:** a new release-gate script,
[`scripts/verify-published-tarball.mjs`](../../scripts/verify-published-tarball.mjs),
fetches the freshly-published tarball from the registry, runs
`npx --yes @neurodock/cli@<version> --version` against it from a
scratch directory, and exits non-zero if resolution fails. Wire this
into the publish pipeline so the next instance of this bug class
fails the release instead of poisoning `@latest`.

0.6.0 has been deprecated on the registry with a pointer to 0.6.1.

No code changes vs 0.6.0. Same surface, same behaviour, just an
installable tarball.

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
