# NeuroDock — Claude Code plugin

The local-first cognitive substrate for neurodivergent professionals, packaged
as a Claude Code plugin. Installing it registers the five NeuroDock MCP servers
and a set of ND-aware skills in one step.

## Install

```sh
/plugin marketplace add tlennon-ie/neurodock
/plugin install neurodock@neurodock
```

## Prerequisite: `uv`

The bundled MCP servers are Python packages launched with [`uvx`](https://docs.astral.sh/uv/),
which fetches and runs them from PyPI on first use (no manual `pip install`).
Install `uv` first:

```sh
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Each MCP server still goes through Claude Code's per-server approval the first
time it runs.

## What's bundled

### MCP servers (`.mcp.json`)

| Server                        | Tools                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| `neurodock-chronometric`      | time context, session start/end, break prompts, idle status   |
| `neurodock-cognitive-graph`   | entity recall, fact recording, decision recall, weekly rollup |
| `neurodock-task-fractionator` | goal decomposition, next-action selection                     |
| `neurodock-translation`       | incoming decode, tone check, outgoing rewrite, meeting brief  |
| `neurodock-guardrail`         | rumination / hyperfocus / sycophancy advisories               |

### Skills (`skills/`)

Twelve ND-aware skills ship with the plugin, in two groups.

**Substrate skills** — each teaches Claude the exact tool contract and the
ND-aware "voice" for surfacing one server's results:
`translate-incoming`, `record-fact`, `decompose-task`, `check-rumination`,
`chronometric-mark-start`, `chronometric-mark-end`.

**Per-neurotype skills** — higher-level workflows tuned to a specific
neurotype (authored in `packages/skills/` and bundled here verbatim via
`scripts/sync-skills.mjs`, with a CI drift guard keeping the two in sync):
`adhd-daily-planner`, `asd-meeting-translator`, `audhd-context-recovery`,
`hyperfocus-formatter`, `ocd-decision-finalizer`, `visual-organizer`.

## Privacy

All NeuroDock data stays on your device. The cognitive graph (`~/.neurodock/`)
and your profile never leave the machine, and the servers transmit nothing.
The translation server orchestrates prompts against whatever LLM your MCP
client is configured to use; it makes no network calls of its own.

## Links

- Project: <https://neurodock.org/>
- Source & docs: <https://github.com/tlennon-ie/neurodock>
- License: AGPL-3.0-or-later
