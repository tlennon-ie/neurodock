# example-skill-pomodoro

This is a reference example plugin. Copy this directory to start your own skill plugin.

It demonstrates the minimum surface area an out-of-tree NeuroDock skill plugin needs: a `plugin.yaml` manifest that conforms to [`plugin.schema.json`](../../packages/core/schemas/plugin.schema.json), a `SKILL.md` that matches the in-tree skill convention, three replayable test invocations, and an SPDX-by-reference `LICENSE` stub. The skill itself is intentionally small — a 25-minute Pomodoro coach that wires together four `mcp-chronometric` tools and (optionally) one `mcp-cognitive-graph` tool.

## Why this exists

[ADR 0007](../../docs/decisions/0007-plugin-protocol.md) defines the plugin protocol but does not ship a concrete example. Without a worked reference, the documentation is theoretical. This plugin fills that gap. It is also the directory the contributor docs link to when they say "start from the example".

## What this plugin demonstrates

- **The full required-field set of `plugin.yaml`** — `schema_version`, `name`, `type: skill`, `version`, `description`, `license`, `trust`.
- **`trust.level: community`** with a `source_url`, which is what every out-of-tree contributor plugin will use.
- **`requires.mcp_servers`** with a real declared dependency on `mcp-chronometric`.
- **`provides[].type: skill`** with a sandboxed relative path (`./SKILL.md`).
- **`neurotypes: []` (intentionally empty)** — the skill is neurotype-agnostic and auto-activates for every user. We avoid claiming Pomodoro is "for ADHD" or "for ASD" because that's a clinical framing the project's ethics commitments prohibit (see [MANIFESTO.md](../../MANIFESTO.md)). Pomodoro works for whoever it works for. Your plugin's `neurotypes` array should be empty unless your skill makes sense **only** for a specific neurotype.
- **SKILL.md frontmatter conventions** — exact same shape as in-tree skills under `packages/skills/<name>/`.
- **A three-test invocation suite** — start, custom duration, and full lifecycle including the break trigger.

## In-tree vs out-of-tree skills

NeuroDock has two paths for adding a skill, and they have different requirements:

| Path                    | Lives at                                            | Needs `plugin.yaml`? | Needs `SKILL.md`? |
| ----------------------- | --------------------------------------------------- | -------------------- | ----------------- |
| **In-tree first-party** | `packages/skills/<name>/`                           | No                   | Yes               |
| **Out-of-tree plugin**  | `plugins/<name>/` or `~/.neurodock/plugins/<name>/` | **Yes**              | Yes               |

The reason: in-tree skills inherit trust and licensing from the repo (the `LICENSE` at the repo root, the maintainer-signed commits). Out-of-tree plugins are loaded by the substrate from places it did not write itself, so it needs a manifest to declare trust level, license, version, and dependencies before activating anything.

If you're contributing a first-party skill, drop a directory under `packages/skills/`. If you're publishing a plugin from your own repo, use this directory as your template.

## How to install for local testing

Use the NeuroDock CLI (requires `@neurodock/cli` ≥ 0.4.0). Run from the repo root:

```sh
# Install
neurodock plugin add ./plugins/example-skill-pomodoro

# Activate
neurodock plugin enable example-skill-pomodoro

# Restart your MCP client (Claude Desktop, Claude Code, Cursor)

# Verify
neurodock plugin list
```

`plugin add` copies the directory into the per-user root (`$XDG_DATA_HOME/neurodock/plugins/example-skill-pomodoro/`, with platform fallbacks for macOS `~/Library/Application Support/neurodock/plugins/` and Windows `%APPDATA%\neurodock\plugins\`). The substrate also scans `<repo>/plugins/*/plugin.yaml`, so for this example you already have it discovered just by cloning the repo — no `plugin add` needed if you're working in-tree.

<details>
<summary>Manual install per OS (if you don't have the CLI yet)</summary>

Linux:

```bash
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/example-skill-pomodoro ~/.local/share/neurodock/plugins/
```

macOS:

```bash
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/example-skill-pomodoro "$HOME/Library/Application Support/neurodock/plugins/"
```

Windows PowerShell:

```powershell
$dest = "$env:APPDATA\neurodock\plugins\example-skill-pomodoro"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\example-skill-pomodoro $dest
```

A symlink works as well; the loader follows symlinks but rejects symlinks that point outside the plugin directory (path sandbox; see ADR 0007 decision 6). Restart your LLM client after copying.

</details>

## How to fork this as your own plugin

1. Copy the entire directory under a new name: `cp -r plugins/example-skill-pomodoro plugins/my-skill-name`.
2. Edit `plugin.yaml`:
   - Change `name`, `description`, `keywords`, `homepage`, `repository`, and `trust.source_url`.
   - Change `authors` to your name + handle.
   - Adjust `requires.mcp_servers` to your actual dependencies.
   - Adjust `neurotypes` ONLY if your skill is unambiguously neurotype-specific (most are not).
3. Edit `SKILL.md`:
   - Change the frontmatter `name` to match `plugin.yaml.name`.
   - Rewrite the body for your skill. Keep "Answer First" — first sentence ≤ 80 characters.
   - Keep the section order: When this activates / What it does / Outputs / Do not / What this skill is not.
4. Rewrite the three test invocations under `tests/` so they reflect realistic prompts and expected outputs for **your** skill.
5. Validate the manifest:
   ```bash
   neurodock plugin validate plugins/my-skill-name
   ```

## How to publish

The substrate does not require central publishing. Anyone who can read your repo can install your plugin by copying the directory into their per-user root.

If you want discoverability through the federated registry at `plugins.neurodock.org` (Phase 3), the registry will index any `community`-trust manifest whose `source_url` points at a public repo. There is no submission form in v0.1.0 — the registry crawls public source URLs of plugins users opt-in to publishing.

## What this plugin does NOT do

- It does not enforce focus. The user can interrupt the block any time, and the skill responds in kind.
- It does not aggregate Pomodoro counts across users. Everything stays in the local `mcp-chronometric` SQLite file and (optionally) the local `mcp-cognitive-graph`.
- It does not call any external service.
- It does not make clinical claims. The skill description does not say "this helps with ADHD"; it says what the skill does.

## License

AGPL-3.0-or-later. Same as the repo. See [`LICENSE`](./LICENSE).

## Further reading

- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — the full design rationale.
- [`packages/core/schemas/plugin.schema.json`](../../packages/core/schemas/plugin.schema.json) — the manifest contract.
- [`packages/core/schemas/plugin.example.yaml`](../../packages/core/schemas/plugin.example.yaml) — a heavily commented worked example covering every optional field.
- [`packages/core/schemas/plugin.minimal.yaml`](../../packages/core/schemas/plugin.minimal.yaml) — the six-field minimum.
- [`plugins/README.md`](../README.md) — the short contributor reference for the `plugins/` directory.
- [MANIFESTO.md](../../MANIFESTO.md) — the project's voice and ethics commitments. Skills must honour these.
