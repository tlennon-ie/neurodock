# NeuroDock — Claude Desktop Extensions (`.mcpb`)

One [MCP Bundle](https://github.com/anthropics/mcpb) per NeuroDock server, for
**one-click install in Claude Desktop** without editing `claude_desktop_config.json`.

Claude Desktop extensions are one-server-per-bundle, so there is one manifest
directory per server:

| Directory                          | Server                   | Tools |
| ---------------------------------- | ------------------------ | ----- |
| `neurodock-mcp-chronometric/`      | time / sessions / breaks | 5     |
| `neurodock-mcp-cognitive-graph/`   | persistent entity memory | 4     |
| `neurodock-mcp-task-fractionator/` | goal decomposition       | 2     |
| `neurodock-mcp-translation/`       | communication decoding   | 4     |
| `neurodock-mcp-guardrail/`         | clinical advisories      | 3     |

Each `manifest.json` is a **thin launcher**: it runs `uvx neurodock-mcp-<server>`,
which fetches and runs the published PyPI package on first use. This keeps the
bundles tiny and always in sync with the released servers.

## Prerequisite: `uv`

`uvx` must be on the user's PATH. Install [`uv`](https://docs.astral.sh/uv/) first:

```sh
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

## Build a bundle

```sh
# validate
npx @anthropic-ai/mcpb validate mcpb/neurodock-mcp-translation/manifest.json
# pack -> a .mcpb file (gitignored; treat as a release artefact)
npx @anthropic-ai/mcpb pack mcpb/neurodock-mcp-translation dist/neurodock-mcp-translation.mcpb
```

Then double-click the `.mcpb`, or drag it onto Claude Desktop → Settings →
Extensions. Each server still goes through Claude Desktop's per-extension
approval.

## Privacy

All NeuroDock data stays on the user's device. The cognitive graph and profile
live under `~/.neurodock/` and never leave the machine; the servers make no
network calls of their own. (The translation server orchestrates prompts
against whatever LLM the user's client is configured to use — it does not call
out independently.) Because these bundles do not transmit user data to any
external service, no remote privacy-policy endpoint is required for local
install. A hosted privacy policy on neurodock.org is still needed before
submitting to the **Anthropic Connectors / Desktop Extension directory** — see
[ADR 0008](../docs/decisions/0008-distribution-and-remote-strategy.md).

## Links

- Project: <https://neurodock.org/>
- Source & docs: <https://github.com/tlennon-ie/neurodock>
- License: AGPL-3.0-or-later
