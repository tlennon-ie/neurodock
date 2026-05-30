# 0008 — Distribution and remote strategy (registry, desktop extension, plugin, hosted remote)

- **Status:** proposed
- **Date:** 2026-05-30
- **Deciders:** maintainer (TBD), `mcp-architect`
- **Consulted:** `cli-expert` (owns the installer story), `mcp-server-builder` (HTTP transport in Phase 2), `skill-author` (distributed skill conventions), `community-triage` (registry/marketplace submissions), `clinical-expert` (cognitive-graph / profile sensitivity), `governance-author` (AGPL + privacy-policy posture)
- **Informed:** `release-pilot`, `changelog-keeper`, `doc-writer`, `accessibility-auditor`

## Context

Until now NeuroDock has been distributed exactly one way: the `@neurodock/cli`
npm package pip/uv-installs the five Python MCP servers from PyPI and writes
**stdio** `command` entries into Claude Desktop / Claude Code / Cursor configs.
The servers are stdio-only (FastMCP `app.run()`), single-user, and local-first —
the cognitive graph (`~/.neurodock/cognitive-graph.sqlite`) and `profile.yaml`
never leave the device. There is no HTTP transport, no auth, and no remote
endpoint, so "install remotely" is not currently possible.

We want two things that are in tension with that posture:

1. **Official recognition and lower-friction install** — listing in the MCP
   ecosystem (the official MCP Registry, a one-click Claude Desktop extension, a
   Claude Code plugin that also carries the skills).
2. **A genuine remote server** at `mcp.neurodock.org/mcp` that Claude web/desktop
   can add as a custom connector, eventually submitted to the Anthropic
   Connectors Directory.

The hard constraint is that the cognitive graph holds personal facts and the
profile holds neurotype data. Hosting those multi-tenant is a privacy and
clinical-review obligation we are not taking on now (see `ETHICS.md`).

## Decision drivers

1. **Preserve the local-first / privacy ethos.** Sensitive per-user state must
   not be forced into a remote multi-tenant store.
2. **Zero regression for existing users.** The npm + stdio path must keep
   working byte-for-byte; new channels are additive.
3. **Minimum-effort recognition first.** Prefer the self-serve, no-hosting wins
   before standing up infrastructure.
4. **AGPL boundary.** AGPL-3.0-or-later is fine for self-hosting (source is
   already public); flag it for any enterprise/partner positioning.
5. **One source of truth for the server list.** The server keys/entrypoints in
   `packages/cli/src/lib/mcp-entries.ts` remain canonical; the plugin `.mcp.json`
   and the `.mcpb` manifests mirror it.

## Decision

### Phased rollout

**Phase 1 — local recognition (now, no hosting, no auth):**

- **MCP Registry.** Each server ships a `server.json` (schema `2025-12-11`) under
  the `io.github.tlennon-ie/*` namespace, PyPI package, `uvx` runtime hint, stdio
  transport. Package ownership is proven with an `mcp-name:` HTML-comment marker
  in each package README (the PyPI long-description). Publish via `mcp-publisher`.
- **`.mcpb` Desktop Extensions.** One bundle per server under `mcpb/`, each a thin
  `uvx neurodock-mcp-<server>` launcher (`manifest_version` 0.3).
- **Claude Code plugin.** A marketplace at `.claude-plugin/marketplace.json` lists
  one plugin at `claude-code/neurodock/`, bundling the five MCP servers
  (`.mcp.json`, via `uvx`) and six adapted ND-aware skills.

**Phase 2 — hosted remote (later): stateless servers only.** A single deployment
at `https://mcp.neurodock.org/mcp` (Streamable HTTP + OAuth 2.1 / RFC 9728)
exposing **only** stateless tools. HTTP mode is opt-in behind a flag/env; stdio
stays default. Submit to the Anthropic Connectors Directory (requires a hosted
privacy policy — the current top rejection cause).

**Phase 3 — secondary registries.** mcp.so, Smithery, Glama, PulseMCP, and a PR
to `punkpeye/awesome-mcp-servers`.

### Remote-eligibility boundary (load-bearing)

| Server / tool                         | Remote-eligible | Reason                                         |
| ------------------------------------- | --------------- | ---------------------------------------------- |
| `mcp-translation` (4 tools)           | ✅              | Stateless; no profile/graph reads.             |
| `mcp-guardrail` (3 tools)             | ✅              | Stateless heuristics; advisory only.           |
| `mcp-task-fractionator` → `decompose` | ✅              | Pure decomposition.                            |
| `mcp-task-fractionator` → `next_one`  | ❌              | Reads pending tasks from the cognitive graph.  |
| `mcp-cognitive-graph` (4 tools)       | ❌              | Personal-facts SQLite. Local only.             |
| `mcp-chronometric` (5 tools)          | ❌              | Per-session state + profile reads. Local only. |

### Namespace

Start with `io.github.tlennon-ie/*` (GitHub-OAuth verified, zero friction).
A branded `org.neurodock/*` namespace via DNS-TXT verification on neurodock.org
is a later option once DNS control is confirmed; it requires re-publishing under
the new name.

## Consequences

**Positive:**

- Discoverable through the official Registry, one-click in Claude Desktop, and a
  single-step Claude Code install that also brings the skills.
- No change to the existing npm/stdio path; sensitive state stays local.

**Negative / costs:**

- The Registry `mcp-name` markers only take effect on the next PyPI publish, so
  Phase 1A landing requires a patch release of each server.
- The six distributed skills under `claude-code/neurodock/skills/` are adapted
  copies of the repo-dev skills in `.claude/skills/`; they must be kept in sync
  (a future generation step should dedupe this).
- Phase 2 adds a maintained remote surface (auth, hosting, keeping the stateless
  boundary correct) and depends on DNS control of neurodock.org and a hosted
  privacy policy.

**Neutral:**

- Several package READMEs carry stale prose version strings; out of scope here,
  tracked separately. `pyproject.toml` remains the version source of truth.
