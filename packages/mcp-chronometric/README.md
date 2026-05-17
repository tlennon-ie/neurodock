# neurodock-mcp-chronometric

Time, idle, and break management as an MCP server.

**Version:** 0.0.1 (developer preview, in-memory).

## Status

v0.0.1 implements the five tools specified  Section 6 and ADR
[`0001-chronometric-tool-design.md`](../../docs/decisions/0001-chronometric-tool-design.md):

| Tool | Status |
|---|---|
| `get_time_context` | implemented |
| `mark_session_start` | implemented; auto-closes prior open session |
| `mark_session_end` | implemented |
| `request_break_if_needed` | implemented |
| `idle_status` | implemented; consent-gated, OS probe is a stub |

Session state is in-memory only. SQLite persistence is tracked under the
`# TODO: persist to SQLite` marker in `src/neurodock_mcp_chronometric/state.py`
and lands before v0.1.0 ships.

The OS idle probe is intentionally a no-op stub in v0.0.1: the consent gate is
the hard correctness property, and the probe itself returns ``None`` on every
platform until per-platform implementations and tests land.

## References

- Spec:  Section 6.
- Tool design rationale: `docs/decisions/0001-chronometric-tool-design.md`.
- Authoritative schemas: `packages/mcp-chronometric/schemas/`.

## Running

```sh
uv run neurodock-mcp-chronometric
```

The server speaks the MCP stdio transport.

## Profile

Reads `~/.neurodock/profile.yaml`. Override with `NEURODOCK_PROFILE_PATH` (used
in tests). Fields consumed in v0.0.1:

```yaml
privacy:
  os_idle_consent: true  # required for idle_status to perform the OS probe
chronometric:
  zones: {}  # reserved for v0.1.x profile-declared zone overrides
```

## Development

```sh
uv sync --all-packages --all-extras
uv run pytest packages/mcp-chronometric/tests/ -v
uv run ruff check packages/mcp-chronometric/
uv run ruff format --check packages/mcp-chronometric/
uv run mypy --strict packages/mcp-chronometric/src/
```
