# @neurodock/cli

The `neurodock` installer and diagnostic CLI for [NeuroDock](https://neurodock.org/) — a local-first cognitive substrate for neurodivergent professionals.

Status: **v0.5.0**.

## Quickstart

```bash
# From a published package:
npx --yes @neurodock/cli@latest install-all

# Or step-by-step, also from npm:
npx --yes @neurodock/cli@latest init

# From a fresh clone of the monorepo:
pnpm install
pnpm --filter @neurodock/cli build
node packages/cli/dist/index.js init
```

`neurodock init` wires five Python MCP servers (chronometric,
cognitive-graph, task-fractionator, translation, guardrail) into every
MCP-aware client it can detect. A sixth, the optional native messaging
host, is wired separately via `neurodock host install`.

**Prerequisite:** the CLI does not install Python deps for you unless you
use `install-all`. From a clone run `uv sync` (or
`pip install -e packages/mcp-chronometric` etc.) so the
`neurodock-mcp-*` console entry points are on `$PATH`. From a published
install, `install-all` runs the `pip install` step automatically.

## Commands

| Command                      | What it does                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `neurodock install-all`      | One-command first-time install: pip-install the six servers, wire every detected client, copy the starter profile.         |
| `neurodock init`             | Install MCP servers into Claude Desktop / Claude Code / Cursor (the wiring half of `install-all`).                         |
| `neurodock doctor`           | Diagnose your install — profile validity, client wiring, tool availability.                                                |
| `neurodock validate`         | Schema-validate a profile file (`~/.neurodock/profile.yaml` by default).                                                   |
| `neurodock update`           | Upgrade NeuroDock to the latest version — re-installs the six MCP servers via pip/uv and re-wires client configs.          |
| `neurodock sync`             | Re-shape stale NeuroDock MCP entries in existing client configs. No package upgrade. Non-NeuroDock entries are preserved.  |
| `neurodock uninstall`        | Reverse `init` — remove NeuroDock MCP entries from each client config. Optionally purge `~/.neurodock/`.                   |
| `neurodock examples`         | Print a copy-pasteable prompt cheat-sheet that exercises every wired NeuroDock MCP tool.                                   |
| `neurodock host install`     | Register the optional Chrome Native Messaging host so the browser extension can read `~/.neurodock/profile.yaml` directly. |
| `neurodock host uninstall`   | Remove all NeuroDock native-host manifests and registry pointers.                                                          |
| `neurodock profile show`     | Print the resolved profile with loader defaults applied.                                                                   |
| `neurodock profile validate` | Validate `~/.neurodock/profile.yaml` against the v0.1 schema.                                                              |
| `neurodock plugin add`       | Install a plugin from a local directory into `~/.neurodock/plugins/`.                                                      |
| `neurodock plugin remove`    | Uninstall a plugin (alias: `plugin uninstall`).                                                                            |
| `neurodock plugin list`      | List installed plugins and their enabled state. `--json` for scripting.                                                    |
| `neurodock plugin enable`    | Activate an installed plugin (writes a `.enabled` marker file).                                                            |
| `neurodock plugin disable`   | Deactivate an installed plugin without deleting its files.                                                                 |
| `neurodock plugin validate`  | Schema-validate a plugin manifest without installing.                                                                      |

### `neurodock install-all`

```
neurodock install-all [--client=claude-desktop|claude-code|cursor|all] \
                      [--profile=minimal|example] \
                      [--installer=uv|pip|auto] \
                      [--skip-install] [--yes] [--dry-run]
```

Single-command first-time install. Prefers `uv` if it is on PATH; falls
back to `python -m pip`. After install, verifies each server entrypoint
is on PATH with `<command> --help`, then delegates to `init` to wire
clients.

Exit codes: `0` ok, `1` an entrypoint is missing from PATH after
install, `2` init failed.

### `neurodock init`

```
neurodock init [--client=claude-desktop|claude-code|cursor|all] \
               [--profile=minimal|example] \
               [--dry-run] [--yes]
```

- `--client` defaults to `all`. With `all` we only act on already-existing client configs.
- `--profile` defaults to `example` (the worked "T" profile). Use `minimal` for the shortest valid file.
- `--dry-run` prints the diff and exits 0.
- `--yes` overwrites colliding `mcpServers` keys without prompting.

What `init` does, in order:

1. Detects supported clients per platform (see "Detection locations" below).
2. Copies `profile.example.yaml` or `profile.minimal.yaml` to `~/.neurodock/profile.yaml` if it does not already exist. Sets `identity.display_name` from `$USER` / `%USERNAME%`.
3. Adds `mcpServers` entries for each NeuroDock server to each detected client's config.
4. Preserves all unrelated keys, comments, and unknown server entries already in those configs.

Idempotent. Re-running with no changes is a no-op. Collisions on a previous
key are skipped unless `--yes` is supplied.

### `neurodock update`

```
neurodock update [--client=claude-desktop|claude-code|cursor|all] \
                 [--profile=minimal|example] \
                 [--installer=uv|pip|auto] \
                 [--skip-install] [--yes] [--dry-run] [--no-native-host]
```

One-command upgrade. Same code path as `install-all` — re-runs
`pip install --upgrade` (or `uv tool install`) for every NeuroDock MCP
server, re-wires the detected MCP clients, and re-registers the
optional native-messaging host. Exit codes match `install-all`:
`0` ok, `1` an entrypoint is missing from PATH, `2` init failed.

### `neurodock sync`

```
neurodock sync [--client <id>] [--dry-run]
```

Re-shape stale NeuroDock MCP entries in existing client configs
(version drift, command/args/cwd changes) without upgrading any
packages. Non-NeuroDock entries round-trip untouched. Useful when the
desired wiring shape changed but you don't need a package upgrade.

Before 0.5.0 this lived under `neurodock update`. The verb moved
because users typed `neurodock update` expecting a version upgrade.

### `neurodock validate` / `uninstall`

```
neurodock validate [--file <path>] [--strict]
neurodock uninstall [--client <id>] [--yes] [--purge] [--dry-run]
```

`validate` runs Ajv against `profile.schema.json` and reports field-path
violations. `uninstall` removes NeuroDock entries from every detected
client config; asks (interactively) whether to delete
`~/.neurodock/profile.yaml` and `~/.neurodock/cognitive-graph.sqlite`
(default: no). `--purge` deletes those without prompting.

### `neurodock examples`

```
neurodock examples [--server <name>] [--json]
```

Detects which NeuroDock servers are wired across all detected client
configs and prints 2–3 example prompts per server, each annotated with
the underlying tool name. `--server` filters to one server; `--json`
emits machine-readable output. Honors `NO_COLOR` / `FORCE_COLOR`.

### Detection locations

| Client         | Platform | Path                                                                                 |
| -------------- | -------- | ------------------------------------------------------------------------------------ |
| Claude Desktop | macOS    | `~/Library/Application Support/Claude/claude_desktop_config.json`                    |
| Claude Desktop | Windows  | `%APPDATA%\Claude\claude_desktop_config.json`                                        |
| Claude Desktop | Linux    | `~/.config/Claude/claude_desktop_config.json`                                        |
| Claude Code    | All      | `./.claude/settings.json` (project, preferred) then `~/.claude/settings.json` (user) |
| Cursor         | All      | `./.cursor/mcp.json` (project, preferred) then `~/.cursor/mcp.json` (user)           |

### `neurodock host install` / `uninstall`

```
neurodock host install [--extension-id <id>]
neurodock host uninstall
```

`host install` registers `com.neurodock.profile` (a Chrome Native
Messaging host shipped as `@neurodock/native-host`) with every supported
browser on the machine. After install, the browser extension reads and
writes `~/.neurodock/profile.yaml` directly instead of maintaining a
duplicate in `chrome.storage.local`.

`--extension-id` is repeatable. Pass the published extension id once it
is allocated by the store; while the package is unpublished the default
is a placeholder.

The host is OPTIONAL. The extension keeps working without it — the
popup just shows `Profile sync: extension-local`.

### `neurodock profile show` / `validate`

```
neurodock profile show
neurodock profile validate [--file <path>]
```

`show` prints the resolved profile with loader defaults applied (per
ADR 0004 §15). `validate` runs Ajv against the profile schema.

### `neurodock plugin` group

```
neurodock plugin add <source> [--yes] [--dry-run] [--force]
neurodock plugin remove <name> [--yes] [--dry-run]
neurodock plugin list [--json]
neurodock plugin enable <name>
neurodock plugin disable <name>
neurodock plugin validate <source> [--json]
```

`add` validates `plugin.yaml` against `plugin.schema.json` before copying
into `~/.neurodock/plugins/<name>/`. Enablement is tracked via a
`.enabled` marker file inside each plugin directory — the substrate's
filesystem walk treats marker presence as the single source of truth
(per ADR 0007).

Exit codes for `add`: `0` ok, `1` source invalid, `2` already installed
without `--force`, `3` schema validation failure.

### Profile precedence

Loader precedence (highest first):

1. `$NEURODOCK_PROFILE_PATH`
2. `$XDG_CONFIG_HOME/neurodock/profile.yaml`
3. `~/.neurodock/profile.yaml`

## Build and test

```bash
cd packages/cli
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
node dist/index.js --version
node dist/index.js --help
```

## Design notes

- Strict TypeScript, NodeNext modules, ES2022 target.
- Profile YAML round-trip preserves comments (the `yaml` package's
  `parseDocument` API), per ADR 0004 §14.
- All loader defaults live in `src/profile/defaults.ts` and mirror
  `profile.schema.json` — JSON Schema validation does not apply defaults
  itself, so the loader does.
- No telemetry, no remote calls. `install-all` is the only command that
  shells out to a package manager, and it does so only when invoked.

## Links

- **Home:** [neurodock.org](https://neurodock.org/)
- **Documentation:** [docs.neurodock.org](https://docs.neurodock.org/)
- **Repository:** [github.com/tlennon-ie/neurodock](https://github.com/tlennon-ie/neurodock) (monorepo; this package lives at `packages/cli/`)
- **Issues:** [github.com/tlennon-ie/neurodock/issues](https://github.com/tlennon-ie/neurodock/issues)
- **Changelog:** [`packages/cli/CHANGELOG.md`](https://github.com/tlennon-ie/neurodock/blob/main/packages/cli/CHANGELOG.md)
- **Manifesto + ethics:** [`MANIFESTO.md`](https://github.com/tlennon-ie/neurodock/blob/main/MANIFESTO.md), [`ETHICS.md`](https://github.com/tlennon-ie/neurodock/blob/main/ETHICS.md)

## License

AGPL-3.0-or-later.
