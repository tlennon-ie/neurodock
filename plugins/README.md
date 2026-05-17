# plugins/

Third-party plugins live here. Each plugin is a self-contained directory containing a `plugin.yaml` manifest plus its assets. The substrate auto-discovers plugins matching the user's profile at install time.

Authoring a new plugin requires zero core changes — fork, add a directory, open a PR.

- **Manifest contract:** [`packages/core/schemas/plugin.schema.json`](../packages/core/schemas/plugin.schema.json)
- **Worked example:** [`packages/core/schemas/plugin.example.yaml`](../packages/core/schemas/plugin.example.yaml)
- **Minimal manifest:** [`packages/core/schemas/plugin.minimal.yaml`](../packages/core/schemas/plugin.minimal.yaml)
- **Design rationale:** [`docs/decisions/0007-plugin-protocol.md`](../docs/decisions/0007-plugin-protocol.md)

The long-form contributor guide (how to author each plugin type end-to-end) ships separately. This file is the short reference.

## Quick start

1. Create a directory: `plugins/my-plugin-name/`.
2. Drop a `plugin.yaml` inside (start from `plugin.minimal.yaml`).
3. Add your assets (Markdown prompts, SKILL.md, server binary entrypoint, theme tokens — whatever your `type` requires).
4. Open a PR. CI validates the manifest against the schema.

## The six plugin types

| Type | What it ships | Required extras |
|---|---|---|
| `skill` | A Claude skill (SKILL.md + tests) | A `SKILL.md` alongside `plugin.yaml` (out-of-tree skills need BOTH files; see ADR 0007) |
| `mcp-server` | A new MCP server binary | A runnable entrypoint declared in `provides[].path` |
| `profile` | A curated profile preset | A YAML preset file under `provides[]` |
| `translation-pack` | Domain-specific translation prompts (engineering review, legal, etc.) | At least one `provides[].type: translation-prompt` |
| `language-pack` | Locale-specific overrides for `mcp-translation` defaults | `locale` array; `provides[].type: language-prompt-override` |
| `theme` | Design-system-keeper-approved visual variant | Token files + CSS bundle |

## The minimal manifest

Six required fields:

```yaml
schema_version: "0.1.0"
name: "my-plugin-name" # kebab-case, globally unique within type
type: "skill" # one of the six values above
version: "0.1.0" # semver
description: "One sentence." # no clinical claims (ETHICS commitment 1)
license: "AGPL-3.0-or-later" # must be on the v0.1.0 whitelist
trust:
 level: "community" # see trust ladder below
 source_url: "https://github.com/you/your-plugin"
```

Everything else is optional. See [`plugin.example.yaml`](../packages/core/schemas/plugin.example.yaml) for the full shape.

## The trust ladder

Four levels. The substrate decides what to prompt the user with based on the level and the user's `profile.plugins.*` policy.

| Level | Meaning | User prompt? |
|---|---|---|
| `official` | published by the NeuroDock maintainer | No |
| `verified` | Signed by a verified contributor (maintainer keyring) | No |
| `community` | Author-signed; provenance recorded but not vouched | Prompt-once-remember (default) |
| `experimental` | Unsigned | Refuse by default; user can opt in per session |

Signature verification ships in Phase 3 alongside the federated registry. Until then, `verified` is operationally equivalent to `community` for user experience; the schema field is reserved so we don't re-architect when verification lands.

## The license whitelist

Plugins MUST declare a license on the v0.1.0 whitelist. Anything else refuses to load with a `license_not_allowed` error.

Allowed: `AGPL-3.0-or-later`, `AGPL-3.0-only`, `GPL-3.0-or-later`, `GPL-3.0-only`, `LGPL-3.0-or-later`, `MIT`, `Apache-2.0`, `BSD-3-Clause`, `BSD-2-Clause`, `ISC`, `MPL-2.0`, `CC0-1.0`.

The whitelist can only be extended by ADR. This is intentional friction — license policy is a governance question.

## Auto-activation

A plugin's `neurotypes` and `locale` declarations intersect with the user's `profile.identity.neurotypes` and locale settings to decide whether the substrate auto-activates the plugin.

- **Empty / omitted `neurotypes`** = agnostic; auto-activates for every user.
- **Non-empty intersection with `profile.identity.neurotypes`** = auto-activates.
- **Empty intersection** = installed but not activated; the user enables it manually via `neurodock plugin enable <name>`.

For `language-pack` and `translation-pack`, `locale` intersects similarly with the user's interface locale and the locales recorded in `mcp-translation` requests.

The user's profile is the single consent surface. There is no per-plugin consent store.

## Path sandbox

Every `provides[].path` and every `hooks.*` script path is RELATIVE to the plugin directory. The loader rejects:

- Paths containing `..` that resolve outside the plugin directory.
- Symlinks that point outside the plugin directory.
- Absolute paths or Windows-style drive prefixes.

A plugin that fails path validation is rejected entirely (not partially loaded).

## Hooks (v0.1.0 status)

`hooks.on_install` and `hooks.on_uninstall` are reserved in the schema but the v0.1.0 hook executor refuses to run them unless `trust.level` is `official` or `verified`. Community plugins may declare hooks; they will be ignored until the hook sandbox lands in Phase 3.

If you need a hook for your community plugin today, file an issue describing what it would do — that informs the Phase 3 allow-list.

## Forward-compatibility

Unknown keys at any nesting level are preserved by the loader, not stripped. A v0.1.0 install can read and re-emit a v0.2.0 manifest without data loss. This means: you may add experimental fields to your manifest knowing they will survive substrate upgrades and downgrades.

The trade-off: typos like `verison: "0.1.0"` parse cleanly. Run `neurodock plugin validate <path>` to catch them.

## In-tree vs out-of-tree skills

In-tree first-party skills (under `packages/skills/<name>/`) do NOT need a `plugin.yaml` — the SKILL.md frontmatter is enough. Out-of-tree plugin skills require BOTH files: a `plugin.yaml` (so the substrate can discover, trust-check, and license-check the plugin) and a `SKILL.md` (so the skill loader can activate it). The contracts are independent.

## What plugins MUST NOT do

- Make clinical claims in `description` or any user-facing copy (ETHICS commitment 1).
- Ship under a non-whitelisted license.
- Reach outside the plugin directory at install time.
- Aggregate detection events or telemetry beyond what the user's profile authorises (ETHICS commitment 4).
- Override the user's profile-declared consent in any way.

If a PR appears to do any of the above, flags it for maintainer review.
