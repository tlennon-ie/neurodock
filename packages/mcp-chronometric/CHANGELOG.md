# Changelog

All notable changes to `neurodock-mcp-chronometric` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package follows semantic versioning per `plan.md` §4.

## [0.0.1] - 2026-05-15

### Added

- Initial in-memory implementation of all five chronometric MCP tools defined
  in `plan.md` Section 6 and ADR 0001:
  - `get_time_context()`
  - `mark_session_start(intent)` — auto-closes the prior open session and
    surfaces its metadata in `auto_closed_prior_session`.
  - `mark_session_end(summary?)`
  - `request_break_if_needed(threshold_minutes)`
  - `idle_status()` — consent-gated via `profile.privacy.os_idle_consent`;
    emits a structured `idle_consent_missing` log line when called without
    consent.
- Clock-band energy-zone heuristic per the table in ADR 0001.
- Pydantic models that mirror the JSON Schemas under
  `packages/mcp-chronometric/schemas/`.
- `Clock` protocol plus `SystemClock` and `FrozenClock` so every time read is
  testable.
- FastMCP server entrypoint exposed as the `neurodock-mcp-chronometric`
  console script and importable as `neurodock_mcp_chronometric.server.app`.
- Protocol conformance test that validates every tool response against the
  schemas under `packages/mcp-chronometric/schemas/`.

### Known limitations

- Session state is in-memory only. SQLite persistence is required before v0.1.0
  and is tracked under the `# TODO: persist to SQLite` marker.
- The OS idle probe returns `None` on every platform in v0.0.1. The consent
  gate is fully implemented; the platform-specific probes land in a follow-up.
- Profile-declared zone overrides (`chronometric.zones`) are read but not yet
  used; v0.1.x will honour them.
