# neurodock-mcp-chronometric

Time, idle, and break management as an MCP server. Part of [NeuroDock](https://neurodock.org/) — a local-first cognitive substrate for neurodivergent professionals.

**Version:** 0.0.2 (developer preview, in-memory).

## Install

```sh
uv add neurodock-mcp-chronometric
# or
pip install neurodock-mcp-chronometric
```

## Use as an MCP server

Add to your `~/.claude.json` (Claude Code) or `claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "neurodock-chronometric": {
      "command": "uv",
      "args": ["run", "neurodock-mcp-chronometric"]
    }
  }
}
```

## Status

v0.0.x implements the five tools specified in ADR
[0001 — chronometric tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0001-chronometric-tool-design.md):

| Tool                      | Status                                         |
| ------------------------- | ---------------------------------------------- |
| `get_time_context`        | implemented                                    |
| `mark_session_start`      | implemented; auto-closes prior open session    |
| `mark_session_end`        | implemented                                    |
| `request_break_if_needed` | implemented                                    |
| `idle_status`             | implemented; consent-gated, OS probe is a stub |

Session state is intentionally in-memory for the v0.0.x preview — a single
Claude session typically ends with an explicit `mark_session_end` so durable
storage is not on the hot path. SQLite-backed session history is planned for
v0.1.0 per ADR 0001; until then, restart Claude and any open session is
treated as auto-closed on the next `mark_session_start`.

The OS idle probe is intentionally a no-op stub in v0.0.2: the consent gate is
the hard correctness property, and the probe itself returns `None` on every
platform until per-platform implementations and tests land.

## References

- Tool design rationale: [ADR 0001 — chronometric tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0001-chronometric-tool-design.md).
- Authoritative schemas: [`packages/mcp-chronometric/schemas/`](https://github.com/tlennon-ie/neurodock/tree/main/packages/mcp-chronometric/schemas).
- Project home: [neurodock.org](https://neurodock.org/).
- Manifesto + ethics: [`MANIFESTO.md`](https://github.com/tlennon-ie/neurodock/blob/main/MANIFESTO.md), [`ETHICS.md`](https://github.com/tlennon-ie/neurodock/blob/main/ETHICS.md).

## Running

```sh
uv run neurodock-mcp-chronometric
```

The server speaks the MCP stdio transport.

## Profile

Reads `~/.neurodock/profile.yaml`. Override with `NEURODOCK_PROFILE_PATH` (used
in tests). Fields consumed in v0.0.2:

```yaml
privacy:
  os_idle_consent: true # required for idle_status to perform the OS probe
chronometric:
  zones: {} # reserved for v0.1.x profile-declared zone overrides
```

## Development

```sh
uv sync --all-packages --all-extras
uv run pytest packages/mcp-chronometric/tests/ -v
uv run ruff check packages/mcp-chronometric/
uv run ruff format --check packages/mcp-chronometric/
uv run mypy --strict packages/mcp-chronometric/src/
```
