# @neurodock/cli

The `neurodock` installer and diagnostic CLI.

Status: Phase 1 (v0.1 developer preview).

## Quickstart

```bash
# From a published package once it lands on npm:
npx neurodock init

# From a fresh clone of the monorepo:
pnpm install
pnpm --filter @neurodock/cli build
node packages/cli/dist/index.js init
```

`neurodock init` wires three Python MCP servers (chronometric, cognitive-graph,
task-fractionator) into every MCP-aware client it can detect.

**Prerequisite:** the CLI does not install Python deps for you. From a clone
run `uv sync` (or `pip install -e packages/mcp-chronometric` etc.) so the
`neurodock-mcp-*` console entry points are on `$PATH` for `uv run`. From a
published install this matures into `uv tool install neurodock-mcp-*`.

## Commands

| Command | What it does |
|---|---|
| `neurodock init` | Install MCP servers into Claude Desktop / Claude Code / Cursor. |
| `neurodock doctor` | Diagnose your install — profile validity, client wiring, tool availability. |
| `neurodock profile validate` | Validate `~/.neurodock/profile.yaml` against the v0.1 schema. |
| `neurodock profile show` | Print the resolved profile with loader defaults applied. |
| `neurodock host install` | Register the optional native messaging host so the browser extension can read `~/.neurodock/profile.yaml` directly. |
| `neurodock host uninstall` | Remove all NeuroDock native-host manifests and registry pointers. |

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
3. Adds three `mcpServers` entries (`neurodock-chronometric`, `neurodock-cognitive-graph`, `neurodock-task-fractionator`) to each detected client's config.
4. Preserves all unrelated keys, comments, and unknown server entries already in those configs.

Idempotent. Re-running with no changes is a no-op. Collisions on a previous
key are skipped unless `--yes` is supplied.

### Detection locations

| Client | Platform | Path |
|---|---|---|
| Claude Desktop | macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop | Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Desktop | Linux | `~/.config/Claude/claude_desktop_config.json` |
| Claude Code | All | `./.claude/settings.json` (project, preferred) then `~/.claude/settings.json` (user) |
| Cursor | All | `./.cursor/mcp.json` (project, preferred) then `~/.cursor/mcp.json` (user) |

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
- No telemetry, no remote calls, no auto-install of Python packages.

## License

AGPL-3.0-or-later.
